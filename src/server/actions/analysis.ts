"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { toUserMessage } from "@/lib/errors";
import { scheduleNextTick } from "@/server/services/tick-scheduler";
import type { ActionResult } from "@/server/actions/opportunities";

/** Analisa (ou reprocessa) uma empresa com IA (Blueprint §9). */
export async function analyzeCompanyAction(
  companyId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const result = await services.analysis.analyzeCompany(companyId);
    revalidatePath(`/opportunities/${companyId}`);
    revalidatePath("/opportunities");
    revalidatePath("/");
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  } catch (error) {
    // Nunca devolver error.message cru: pode conter connection string,
    // SQL ou chave de API.
    return {
      ok: false,
      error: toUserMessage("action.analyzeCompany", error, { companyId }),
    };
  }
}

export interface StartRecoveryResult extends ActionResult {
  jobId?: string;
  total?: number;
  alreadyRunning?: boolean;
}

/**
 * Inicia a recuperação de análises como JOB da fila (RF-07).
 *
 * Um clique cria o job; o encadeamento de ticks o leva até zerar a fila. A
 * interface só acompanha o progresso — é o mesmo padrão da prospecção.
 *
 * Substitui o lote síncrono de 3 empresas por clique, que exigia ~8 cliques
 * para 22 empresas.
 */
export async function startAnalysisRecoveryAction(): Promise<StartRecoveryResult> {
  try {
    const { repositories } = await createServerContext();

    const total = await repositories.aiAnalyses.countPendingAnalysis();
    if (total === 0) {
      return { ok: false, error: "Não há empresas aguardando análise." };
    }

    // Idempotência por minuto, igual à prospecção: absorve duplo clique sem
    // depender só do índice único.
    const minute = new Date().toISOString().slice(0, 16);
    const { job, alreadyRunning } =
      await repositories.jobs.createAnalysisRecoveryUnique({
        idempotencyKey: `recovery:${minute}`,
        total,
        // Teto de custo: no máximo uma chamada por empresa pendente, com
        // folga para as que o pré-filtro resolve sem IA.
        maxAiCalls: total + 10,
        deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });

    // Aguardado: é o disparo que tira a execução do lugar sem depender do
    // polling da interface.
    await scheduleNextTick("recovery-start");

    revalidatePath("/opportunities");
    revalidatePath("/");
    return { ok: true, jobId: job.id, total, alreadyRunning };
  } catch (error) {
    return {
      ok: false,
      error: toUserMessage("action.startAnalysisRecovery", error),
    };
  }
}

/** Job de recuperação ainda ativo, para a interface retomar o acompanhamento. */
export async function getActiveRecoveryJobAction(): Promise<string | null> {
  try {
    const { repositories } = await createServerContext();
    const job = await repositories.jobs.findActiveAnalysisRecovery();
    return job?.id ?? null;
  } catch {
    return null;
  }
}

export interface AnalyzePendingResult extends ActionResult {
  analyzed?: number;
  failed?: number;
  recovered?: number;
  remaining?: number;
  stoppedByDeadline?: boolean;
}

/**
 * Analisa em lote as empresas aguardando análise (RF-07).
 *
 * O lote é limitado por tempo para caber no teto da função serverless — o
 * que sobrar continua pendente e é retomado na próxima execução.
 */
export async function analyzePendingAction(): Promise<AnalyzePendingResult> {
  try {
    const { services } = await createServerContext();
    const result = await services.analysis.analyzePending();
    revalidatePath("/opportunities");
    revalidatePath("/");
    return {
      ok: true,
      analyzed: result.analyzed,
      failed: result.failed,
      recovered: result.recovered,
      remaining: result.remaining,
      stoppedByDeadline: result.stoppedByDeadline,
    };
  } catch (error) {
    return { ok: false, error: toUserMessage("action.analyzePending", error) };
  }
}

/**
 * Recuperação administrativa: devolve à fila análises presas em `running`
 * por execuções interrompidas. Idempotente e não destrutiva.
 */
export async function recoverStaleAnalysesAction(): Promise<AnalyzePendingResult> {
  try {
    const { services } = await createServerContext();
    const recovered = await services.analysis.recoverStaleAnalyses();
    revalidatePath("/opportunities");
    revalidatePath("/");
    return { ok: true, recovered };
  } catch (error) {
    return {
      ok: false,
      error: toUserMessage("action.recoverStaleAnalyses", error),
    };
  }
}
