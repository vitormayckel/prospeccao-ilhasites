"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import {
  decisionInputSchema,
  reactivateInputSchema,
  setPriorityInputSchema,
  createNoteInputSchema,
} from "@/lib/validation/company";
import { createFollowUpInputSchema } from "@/lib/validation/follow-up";
import type { Priority } from "@/types/domain";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateOpportunity(companyId?: string) {
  revalidatePath("/");
  revalidatePath("/opportunities");
  revalidatePath("/pipeline");
  if (companyId) revalidatePath(`/opportunities/${companyId}`);
}

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error ? error.message : "Erro ao processar a ação.";
  return { ok: false, error: message };
}

export async function approveCompanyAction(
  companyId: string,
): Promise<ActionResult> {
  try {
    const input = decisionInputSchema.parse({
      companyId,
      decision: "approved",
    });
    const { services } = await createServerContext();
    await services.review.approve(input);
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectCompanyAction(
  companyId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    const input = decisionInputSchema.parse({
      companyId,
      decision: "rejected",
      reason: reason || undefined,
    });
    const { services } = await createServerContext();
    await services.review.reject(input);
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function snoozeCompanyAction(
  companyId: string,
  days = 7,
): Promise<ActionResult> {
  try {
    const snoozedUntil = new Date(Date.now() + days * 86400000);
    const input = decisionInputSchema.parse({
      companyId,
      decision: "snoozed",
      snoozedUntil,
    });
    const { services } = await createServerContext();
    await services.review.snooze(input);
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateCompanyAction(
  companyId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const input = reactivateInputSchema.parse({ companyId, reason });
    const { services } = await createServerContext();
    await services.review.reactivate(input);
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setPriorityAction(
  companyId: string,
  priority: Priority,
): Promise<ActionResult> {
  try {
    const input = setPriorityInputSchema.parse({ companyId, priority });
    const { services } = await createServerContext();
    await services.review.setPriority(input);
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addNoteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = createNoteInputSchema.parse({
      companyId: formData.get("companyId"),
      content: formData.get("content"),
    });
    const { services } = await createServerContext();
    await services.review.addNote(input);
    revalidateOpportunity(input.companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createFollowUpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = createFollowUpInputSchema.parse({
      companyId: formData.get("companyId"),
      dueAt: formData.get("dueAt"),
      notes: formData.get("notes") || undefined,
    });
    const { repositories } = await createServerContext();
    await repositories.followUps.create({
      companyId: input.companyId,
      dueAt: input.dueAt.toISOString(),
      notes: input.notes ?? null,
    });
    revalidateOpportunity(input.companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Conclui um follow-up (RF-13). Não envia mensagem — apenas registra. */
export async function completeFollowUpAction(
  followUpId: string,
): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    const followUp = await repositories.followUps.complete(followUpId);
    revalidateOpportunity(followUp.company_id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
