"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { toActionError } from "@/lib/errors";
import {
  decisionInputSchema,
  reactivateInputSchema,
  setPriorityInputSchema,
  createNoteInputSchema,
} from "@/lib/validation/company";
import { createFollowUpInputSchema } from "@/lib/validation/follow-up";
import {
  APPROACH_CHANNEL,
  CONTACT_ROLE,
  NEXT_ACTION_STATUS,
  type Priority,
  type ApproachChannel,
  type ContactRole,
  type NextActionStatus,
} from "@/types/domain";

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
    toActionError("action.opportunities", error, "Erro ao processar a ação.");
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

// --- Classificações operacionais (Sprint 4) ---------------------------
// Cada alteração grava um evento em audit_events (entity_type='company'),
// que o Timeline da oportunidade agrega. Não altera fluxo de mensagens.

export async function setApproachChannelAction(
  companyId: string,
  value: ApproachChannel,
): Promise<ActionResult> {
  try {
    if (!APPROACH_CHANNEL.includes(value)) throw new Error("Canal inválido.");
    const { repositories } = await createServerContext();
    const before = await repositories.companies.findById(companyId);
    if (!before) throw new Error("Empresa não encontrada.");
    await repositories.companies.setApproachChannel(companyId, value);
    await repositories.audit.log({
      entityType: "company",
      entityId: companyId,
      action: "approach_channel_changed",
      metadata: { from: before.approach_channel, to: value },
    });
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setContactRoleAction(
  companyId: string,
  value: ContactRole | null,
): Promise<ActionResult> {
  try {
    if (value !== null && !CONTACT_ROLE.includes(value))
      throw new Error("Classificação inválida.");
    const { repositories } = await createServerContext();
    const before = await repositories.companies.findById(companyId);
    if (!before) throw new Error("Empresa não encontrada.");
    await repositories.companies.setContactRole(companyId, value);
    await repositories.audit.log({
      entityType: "company",
      entityId: companyId,
      action: "contact_role_changed",
      metadata: { from: before.contact_role, to: value },
    });
    revalidateOpportunity(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setNextActionStatusAction(
  companyId: string,
  value: NextActionStatus | null,
): Promise<ActionResult> {
  try {
    if (value !== null && !NEXT_ACTION_STATUS.includes(value))
      throw new Error("Status inválido.");
    const { repositories } = await createServerContext();
    const before = await repositories.companies.findById(companyId);
    if (!before) throw new Error("Empresa não encontrada.");
    await repositories.companies.setNextActionStatus(companyId, value);
    await repositories.audit.log({
      entityType: "company",
      entityId: companyId,
      action: "next_action_changed",
      metadata: { from: before.next_action_status, to: value },
    });
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

/** Conclui um follow-up (RF-13). Não envia mensagem — apenas registra. Se for
 *  lembrete de "sem resposta", avança a cadência (§5) via serviço de contato. */
export async function completeFollowUpAction(
  followUpId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const followUp = await services.contact.completeFollowUp(followUpId);
    revalidateOpportunity(followUp.company_id);
    revalidatePath("/messages");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
