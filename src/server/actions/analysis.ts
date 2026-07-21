"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { toUserMessage } from "@/lib/errors";
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
