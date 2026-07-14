"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import type { ActionResult } from "@/server/actions/opportunities";
import { messageKindEnum } from "@/lib/validation/common";
import { z } from "zod";

const openInputSchema = z.object({
  companyId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  type: messageKindEnum,
  content: z.string().min(1).max(4000),
  phoneE164: z.string().nullable().optional(),
});

export interface OpenMessageResult extends ActionResult {
  messageId?: string;
}

/**
 * Registra a abertura do WhatsApp (RN-03). NÃO envia — o link é aberto no
 * cliente; aqui só persistimos "opened" e o conteúdo final (RN-13).
 */
export async function openWhatsappMessageAction(
  input: z.input<typeof openInputSchema>,
): Promise<OpenMessageResult> {
  try {
    const data = openInputSchema.parse(input);
    const { services } = await createServerContext();
    const message = await services.messaging.open({
      companyId: data.companyId,
      templateId: data.templateId ?? null,
      type: data.type,
      content: data.content,
      phoneE164: data.phoneE164 ?? null,
    });
    revalidatePath(`/opportunities/${data.companyId}`);
    revalidatePath("/messages");
    return { ok: true, messageId: message.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao registrar.",
    };
  }
}

/** Confirmação manual de envio (RN-03/RN-14). Avança o pipeline se aplicável. */
export async function confirmMessageSentAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const message = await services.messaging.confirmSent(messageId);
    revalidatePath(`/opportunities/${message.company_id}`);
    revalidatePath("/messages");
    revalidatePath("/pipeline");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao confirmar.",
    };
  }
}

/** Operador não enviou a mensagem (RN-03). */
export async function markMessageNotSentAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const { services } = await createServerContext();
    const message = await services.messaging.markNotSent(messageId);
    revalidatePath(`/opportunities/${message.company_id}`);
    revalidatePath("/messages");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar.",
    };
  }
}
