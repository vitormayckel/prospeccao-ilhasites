"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao analisar.",
    };
  }
}

export interface AnalyzePendingResult extends ActionResult {
  analyzed?: number;
  failed?: number;
}

/** Analisa em lote as empresas aguardando análise (RF-07). */
export async function analyzePendingAction(): Promise<AnalyzePendingResult> {
  try {
    const { services } = await createServerContext();
    const result = await services.analysis.analyzePending(20);
    revalidatePath("/opportunities");
    revalidatePath("/");
    return { ok: true, analyzed: result.analyzed, failed: result.failed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao analisar.",
    };
  }
}
