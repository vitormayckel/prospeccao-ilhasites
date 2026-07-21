import "server-only";
import type { CompaniesRepository } from "@/server/repositories/companies-repository";
import type { AiAnalysesRepository } from "@/server/repositories/ai-analyses-repository";
import type { AnalysisProvider } from "@/server/providers/analysis";
import {
  resolveDefaultAnalysisProvider,
  PROMPT_VERSION,
} from "@/server/providers/analysis";
import {
  buildCompanySnapshot,
  snapshotRefs,
} from "@/server/services/analysis-snapshot";
import { prospectAnalysisSchema } from "@/lib/validation/analysis";
import { logAndSanitize, logInfo, newCorrelationId } from "@/lib/errors";
import type { ProspectAnalysis } from "@/types/domain";

// Máximo de tentativas: 1 + 2 retries (Blueprint §9.4/§9.6/8).
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------
// Limites compatíveis com o menor teto de função da Vercel (Hobby, 10s).
//
// Paliativo consciente da FASE 1: sem worker persistente, o lote precisa
// caber dentro do request. Antes, `analyzePending(20)` rodava até ~30min no
// pior caso, era morto no meio pela plataforma e deixava análises presas em
// `running`. A solução definitiva é a fila persistente da FASE 2.
// ---------------------------------------------------------------------

/** Empresas por invocação. Baixo de propósito. */
const DEFAULT_BATCH_SIZE = 3;

/** Orçamento total do lote, com margem antes do corte da plataforma. */
const BATCH_DEADLINE_MS = 8_000;

/** Reserva mínima para tentar mais uma empresa sem estourar o orçamento. */
const PER_COMPANY_RESERVE_MS = 2_500;

/** Depois disto, uma análise `running` é considerada expirada (§8/§11). */
const STALE_ANALYSIS_MINUTES = 10;

export interface AnalyzeResult {
  ok: boolean;
  companyId: string;
  score?: number;
  error?: string;
}

export interface AnalyzeBatchResult {
  analyzed: number;
  failed: number;
  costEstimate: number;
  /** Análises expiradas recuperadas antes do lote. */
  recovered: number;
  /** Empresas não processadas por falta de orçamento de tempo. */
  remaining: number;
  /** true quando o lote parou pelo deadline, não por acabar a fila. */
  stoppedByDeadline: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Saneia e reconcilia a análise ANTES da validação semântica (mutação in-place;
 * os valores saneados são os que serão persistidos):
 * - remove evidence_refs que não existam no snapshot, sem rejeitar a análise;
 * - deriva o score da soma dos points do breakdown (score recalculável, §9.6/5),
 *   eliminando divergências aritméticas do modelo. Limitado a 0–100.
 */
function sanitizeAnalysis(analysis: ProspectAnalysis, refs: Set<string>): void {
  const items = [
    ...analysis.score_breakdown,
    ...analysis.positives,
    ...analysis.risks,
    ...analysis.opportunities,
    ...analysis.sales_arguments,
  ];
  for (const item of items) {
    item.evidence_refs = item.evidence_refs.filter((ref) => refs.has(ref));
  }
  const sum = analysis.score_breakdown.reduce((s, d) => s + d.points, 0);
  analysis.score = Math.max(0, Math.min(100, Math.round(sum)));
}

/** Verifica invariantes semânticas do contrato (Blueprint §9.6, passos 5-6). */
function validateSemantics(analysis: ProspectAnalysis): string | null {
  for (const d of analysis.score_breakdown) {
    if (d.points > d.max_points) {
      return `dimensão "${d.dimension}" excede o máximo (${d.points}/${d.max_points})`;
    }
  }
  return null;
}

export function createAnalysisService(deps: {
  companies: CompaniesRepository;
  aiAnalyses: AiAnalysesRepository;
  /** Provedor explícito (testes); senão resolve pelo ambiente. */
  provider?: AnalysisProvider;
}) {
  const { companies, aiAnalyses } = deps;

  async function analyzeCompany(companyId: string): Promise<AnalyzeResult> {
    const detail = await companies.getDetail(companyId);
    if (!detail)
      return { ok: false, companyId, error: "Empresa não encontrada." };

    const { company, sources } = detail;
    const snapshot = buildCompanySnapshot(company, sources);
    const refs = snapshotRefs(snapshot);

    let provider: AnalysisProvider;
    try {
      provider = deps.provider ?? resolveDefaultAnalysisProvider();
    } catch (err) {
      return {
        ok: false,
        companyId,
        error: err instanceof Error ? err.message : "Provedor indisponível.",
      };
    }

    const record = await aiAnalyses.createRunning({
      companyId,
      provider: provider.name,
      model: process.env.ANTHROPIC_MODEL || provider.name,
      promptVersion: PROMPT_VERSION,
      snapshot: snapshot as unknown as Record<string, unknown>,
    });

    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await provider.analyze({
          snapshot,
          promptVersion: PROMPT_VERSION,
        });

        const parsed = prospectAnalysisSchema.safeParse(response.analysis);
        if (!parsed.success) {
          lastError = `schema inválido: ${parsed.error.issues[0]?.message ?? "erro"}`;
          throw new Error(lastError);
        }
        sanitizeAnalysis(parsed.data, refs);
        const semanticError = validateSemantics(parsed.data);
        if (semanticError) {
          lastError = semanticError;
          throw new Error(lastError);
        }

        await aiAnalyses.complete(record.id, {
          model: response.model,
          output: parsed.data,
          score: parsed.data.score,
          potential: parsed.data.potential,
          confidence: parsed.data.confidence,
          tokensInput: response.tokensInput,
          tokensOutput: response.tokensOutput,
          costEstimate: response.costEstimate,
          latencyMs: response.latencyMs,
        });
        await companies.updateReviewAndStage(companyId, {
          reviewStatus: "pending_review",
          pipelineStage: "analyzed",
          score: parsed.data.score,
        });
        return { ok: true, companyId, score: parsed.data.score };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Falha na análise.";
        if (attempt < MAX_ATTEMPTS) await sleep(300 * 2 ** (attempt - 1));
      }
    }

    // Esgotadas as tentativas (§9.6/9): marca falha e libera reprocessamento.
    await aiAnalyses.markFailed(record.id, lastError);
    await companies.updateReviewAndStage(companyId, {
      reviewStatus: "analysis_failed",
    });
    return { ok: false, companyId, error: lastError };
  }

  /**
   * Analisa em lote as empresas pendentes (RF-07), respeitando um orçamento
   * de tempo. Para antes do corte da plataforma em vez de ser morto no meio,
   * o que deixaria linhas presas em `running`.
   *
   * Idempotente por invocação: o que não couber permanece em
   * `pending_analysis` e volta no próximo acionamento.
   */
  async function analyzePending(
    limit = DEFAULT_BATCH_SIZE,
  ): Promise<AnalyzeBatchResult> {
    const startedAt = Date.now();
    const correlationId = newCorrelationId();

    // Antes de qualquer coisa: devolve à fila o que ficou preso em execuções
    // interrompidas. Sem isto a fila trava permanentemente.
    let recovered = 0;
    try {
      recovered = await aiAnalyses.recoverStaleRunning(STALE_ANALYSIS_MINUTES);
      if (recovered > 0) {
        logInfo("analysis.recoveredStale", { correlationId, recovered });
      }
    } catch (error) {
      // Recuperação é oportunista: falhar aqui não impede o lote.
      logAndSanitize("analysis.recoverStale", error, { correlationId });
    }

    const pending = await aiAnalyses.listCompaniesPendingAnalysis(limit);
    logInfo("analysis.batchStart", {
      correlationId,
      pending: pending.length,
      limit,
    });

    let analyzed = 0;
    let failed = 0;
    let processed = 0;
    let stoppedByDeadline = false;

    for (const company of pending) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > BATCH_DEADLINE_MS - PER_COMPANY_RESERVE_MS) {
        stoppedByDeadline = true;
        break;
      }
      processed++;
      // Uma empresa com erro não pode abortar o lote inteiro.
      try {
        const result = await analyzeCompany(company.id);
        if (result.ok) analyzed++;
        else failed++;
      } catch (error) {
        failed++;
        logAndSanitize("analysis.company", error, {
          correlationId,
          companyId: company.id,
        });
      }
    }

    const result: AnalyzeBatchResult = {
      analyzed,
      failed,
      costEstimate: 0,
      recovered,
      remaining: pending.length - processed,
      stoppedByDeadline,
    };
    logInfo("analysis.batchEnd", {
      correlationId,
      ...result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  /** Recuperação administrativa de análises expiradas (§8/§11). */
  async function recoverStaleAnalyses(): Promise<number> {
    return aiAnalyses.recoverStaleRunning(STALE_ANALYSIS_MINUTES);
  }

  return { analyzeCompany, analyzePending, recoverStaleAnalyses };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
