"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerContext } from "@/server/context";
import { toActionError } from "@/lib/errors";
import type { ActionResult } from "@/server/actions/opportunities";

function revalidateContact(companyId: string) {
  revalidatePath(`/opportunities/${companyId}`);
  revalidatePath("/opportunities");
  revalidatePath("/messages");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

function fail(error: unknown): ActionResult {
  return {
    ok: false,
    error: toActionError("action.contact", error, "Erro ao processar a ação."),
  };
}

const openSchema = z.object({
  companyId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  phoneE164: z.string().nullable().optional(),
});

export interface OpenContactResult extends ActionResult {
  messageId?: string;
}

/** Passo 2–3: registra a abertura do WhatsApp com APENAS a saudação. */
export async function openGreetingAction(
  input: z.input<typeof openSchema>,
): Promise<OpenContactResult> {
  try {
    const data = openSchema.parse(input);
    const { services } = await createServerContext();
    const message = await services.contact.openGreeting({
      companyId: data.companyId,
      content: data.content,
      phoneE164: data.phoneE164 ?? null,
    });
    revalidateContact(data.companyId);
    return { ok: true, messageId: message.id };
  } catch (error) {
    return fail(error);
  }
}

/** Passo 4–5: confirma a saudação enviada → "Aguardando resposta". */
export async function confirmGreetingSentAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const company = await services.contact.confirmGreetingSent(messageId);
    revalidateContact(company.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Passo 6: operador marca manualmente que o lead respondeu. */
export async function markRepliedAction(
  companyId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    await services.contact.markReplied(companyId);
    revalidateContact(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Passo 7–8: registra a abertura do WhatsApp com a mensagem comercial. */
export async function openCommercialAction(
  input: z.input<typeof openSchema>,
): Promise<OpenContactResult> {
  try {
    const data = openSchema.parse(input);
    const { services } = await createServerContext();
    const message = await services.contact.openCommercial({
      companyId: data.companyId,
      content: data.content,
      phoneE164: data.phoneE164 ?? null,
    });
    revalidateContact(data.companyId);
    return { ok: true, messageId: message.id };
  } catch (error) {
    return fail(error);
  }
}

/** Confirma o envio da mensagem comercial. */
export async function confirmCommercialSentAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const company = await services.contact.confirmCommercialSent(messageId);
    revalidateContact(company.id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const scheduleSchema = z.object({
  companyId: z.string().uuid(),
  dueAt: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});

/** §5C: agenda um follow-up manual e marca "Follow-up agendado". */
export async function scheduleContactFollowUpAction(
  input: z.input<typeof scheduleSchema>,
): Promise<ActionResult> {
  try {
    const data = scheduleSchema.parse(input);
    const { services } = await createServerContext();
    await services.contact.scheduleFollowUp({
      companyId: data.companyId,
      dueAt: data.dueAt.toISOString(),
      notes: data.notes ?? null,
    });
    revalidateContact(data.companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Encerra o contato. */
export async function closeContactAction(
  companyId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    await services.contact.close(companyId);
    revalidateContact(companyId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
