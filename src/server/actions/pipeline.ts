"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { toActionError } from "@/lib/errors";
import { movePipelineInputSchema } from "@/lib/validation/company";
import type { ActionResult } from "@/server/actions/opportunities";
import type { PipelineStage } from "@/types/domain";

export async function moveStageAction(
  companyId: string,
  toStage: PipelineStage,
  reason?: string,
): Promise<ActionResult> {
  try {
    const input = movePipelineInputSchema.parse({
      companyId,
      toStage,
      reason: reason || undefined,
    });
    const { services } = await createServerContext();
    await services.pipeline.move({
      companyId: input.companyId,
      toStage: input.toStage,
      reason: input.reason ?? null,
    });
    revalidatePath("/pipeline");
    revalidatePath("/");
    revalidatePath(`/opportunities/${companyId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        toActionError("action.pipeline", error, "Erro ao mover no pipeline."),
    };
  }
}
