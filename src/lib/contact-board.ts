// =====================================================================
// Agrupamento operacional da página de Mensagens (§2). Deriva o "balde" de
// cada empresa dos estados que já existem no domínio (contact_stage + status
// da última mensagem) — sem inventar estados novos. Puro e client-safe.
// =====================================================================

import type { ContactStage, MessageStatus } from "@/types/domain";

export type ContactBucket =
  | "awaiting_send"
  | "awaiting_reply"
  | "replied"
  | "sent"
  | "follow_ups"
  | "failed"
  | "closed";

export const CONTACT_BUCKET_ORDER: ContactBucket[] = [
  "awaiting_send",
  "awaiting_reply",
  "replied",
  "sent",
  "follow_ups",
  "failed",
  "closed",
];

export const CONTACT_BUCKET_LABEL: Record<ContactBucket, string> = {
  awaiting_send: "Aguardando envio",
  awaiting_reply: "Aguardando resposta",
  replied: "Respondidas",
  sent: "Enviadas",
  follow_ups: "Follow-ups",
  failed: "Falhas",
  closed: "Encerradas",
};

/** Descrição curta de cada balde — reforça que "preparada" ≠ "enviada" (§2). */
export const CONTACT_BUCKET_HELP: Record<ContactBucket, string> = {
  awaiting_send: "Mensagem preparada, ainda não enviada — confirme após enviar.",
  awaiting_reply: "Saudação enviada; aguardando o lead responder.",
  replied: "Lead respondeu — prepare a mensagem comercial.",
  sent: "Mensagem comercial enviada.",
  follow_ups: "Com follow-up agendado.",
  failed: "Marcada como não enviada.",
  closed: "Contato encerrado.",
};

export function contactBucketOf(row: {
  contact_stage: ContactStage;
  last_message_status: MessageStatus | null;
}): ContactBucket {
  if (row.last_message_status === "not_sent") return "failed";
  switch (row.contact_stage) {
    case "closed":
      return "closed";
    case "follow_up_scheduled":
      return "follow_ups";
    case "commercial_sent":
      return "sent";
    case "replied":
      return "replied";
    case "awaiting_reply":
      return "awaiting_reply";
    case "greeting_prepared":
    case "commercial_prepared":
      return "awaiting_send";
    case "not_started":
      // Legado: sem estágio de contato, classifica pela última mensagem.
      if (row.last_message_status === "confirmed_sent") return "sent";
      if (row.last_message_status === "opened") return "awaiting_send";
      return "closed";
  }
}
