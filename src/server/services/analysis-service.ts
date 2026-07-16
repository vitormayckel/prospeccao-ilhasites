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
import type { ProspectAnalysis } from "@/types/domain";

// Máximo de tentativas: 1 + 2 retries (Blueprint §9.4/§9.6/8).
const MAX_ATTEMPTS = 3;

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

  /** Analisa em lote as empresas pendentes (RF-07). */
  async function analyzePending(limit = 20): Promise<AnalyzeBatchResult> {
    const pending = await aiAnalyses.listCompaniesPendingAnalysis(limit);
    let analyzed = 0;
    let failed = 0;
    for (const company of pending) {
      const result = await analyzeCompany(company.id);
      if (result.ok) analyzed++;
      else failed++;
    }
    return { analyzed, failed, costEstimate: 0 };
  }

  return { analyzeCompany, analyzePending };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
