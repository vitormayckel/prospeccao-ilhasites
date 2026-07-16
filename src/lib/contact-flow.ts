// =====================================================================
// Fluxo de contato (regra central §1): saudação primeiro, comercial depois.
// Estados explícitos + a ÚNICA próxima ação por estado (§7). Puro, sem
// efeitos — compartilhado entre servidor e cliente.
// =====================================================================

import type { CompanyRow, ContactStage, ProspectAnalysis } from "@/types/domain";

export const CONTACT_STAGE_LABEL: Record<ContactStage, string> = {
  not_started: "Saudação pendente",
  greeting_prepared: "Saudação preparada",
  awaiting_reply: "Aguardando resposta",
  replied: "Lead respondeu",
  commercial_prepared: "Mensagem comercial preparada",
  commercial_sent: "Mensagem comercial enviada",
  follow_up_scheduled: "Follow-up agendado",
  closed: "Encerrado",
};

export type ContactActionId =
  | "prepare_greeting"
  | "confirm_greeting_sent"
  | "mark_replied"
  | "prepare_commercial"
  | "confirm_commercial_sent"
  | "schedule_follow_up"
  | "close"
  | "none";

export interface NextContactAction {
  id: ContactActionId;
  label: string;
  hint: string;
}

/**
 * O fluxo só começa depois que a empresa é aprovada. Antes disso, a próxima
 * ação é decidir na revisão (fora deste componente).
 */
export function canStartContact(
  company: Pick<CompanyRow, "review_status" | "contact_stage">,
): boolean {
  return (
    company.review_status === "approved" ||
    company.contact_stage !== "not_started"
  );
}

/** A única próxima ação recomendada para o estado atual (§7). */
export function nextContactAction(stage: ContactStage): NextContactAction {
  switch (stage) {
    case "not_started":
      return {
        id: "prepare_greeting",
        label: "Preparar saudação",
        hint: "A primeira mensagem é só uma saudação curta, sem conteúdo comercial.",
      };
    case "greeting_prepared":
      return {
        id: "confirm_greeting_sent",
        label: "Confirmar saudação enviada",
        hint: "Confirme apenas depois de enviar a saudação pelo WhatsApp.",
      };
    case "awaiting_reply":
      return {
        id: "mark_replied",
        label: "Marcar que o lead respondeu",
        hint: "O sistema não lê o WhatsApp; confirme a resposta manualmente.",
      };
    case "replied":
      return {
        id: "prepare_commercial",
        label: "Preparar mensagem comercial",
        hint: "Agora sim: mensagem curta e personalizada com base na análise.",
      };
    case "commercial_prepared":
      return {
        id: "confirm_commercial_sent",
        label: "Confirmar mensagem comercial enviada",
        hint: "Confirme apenas depois de enviar pelo WhatsApp.",
      };
    case "commercial_sent":
      return {
        id: "schedule_follow_up",
        label: "Agendar follow-up",
        hint: "Organize o próximo lembrete. Nada é enviado automaticamente.",
      };
    case "follow_up_scheduled":
      return {
        id: "close",
        label: "Encerrar contato",
        hint: "Encerre quando não houver mais próximos passos.",
      };
    case "closed":
      return {
        id: "none",
        label: "Contato encerrado",
        hint: "Reabra pelo pipeline se precisar retomar.",
      };
  }
}

const OBSERVATION_MAX = 180;

/** Observação breve e verdadeira, tirada da análise — nunca afirma ausência
 *  de site quando o dado não está confirmado. */
function pickObservation(
  company: Pick<CompanyRow, "website_url">,
  analysis: ProspectAnalysis | null | undefined,
): string {
  const fromAnalysis =
    analysis?.opportunities?.[0]?.text ?? analysis?.sales_arguments?.[0]?.text;
  if (fromAnalysis && fromAnalysis.trim()) {
    const t = fromAnalysis.trim();
    return t.length > OBSERVATION_MAX ? t.slice(0, OBSERVATION_MAX - 1) + "…" : t;
  }
  // Sem análise: observação neutra que não afirma inexistência de site.
  return company.website_url
    ? "Achei interessante o trabalho de vocês e queria entender melhor a operação."
    : "Fiquei com algumas ideias sobre a presença digital de vocês.";
}

/**
 * Monta a sugestão de mensagem comercial (§3): agradecimento → contexto →
 * observação verdadeira → pergunta curta de descoberta. Texto sugerido; o
 * operador revisa e edita antes de abrir o WhatsApp.
 */
export function buildCommercialSuggestion(
  company: Pick<CompanyRow, "name" | "primary_category" | "city" | "website_url">,
  analysis: ProspectAnalysis | null | undefined,
): string {
  const category = company.primary_category ?? "o segmento de vocês";
  const city = company.city ?? "a região";
  const observation = pickObservation(company, analysis);
  return [
    "Obrigado por responder!",
    `Encontrei a ${company.name} enquanto pesquisava ${category} em ${city}.`,
    observation,
    "Hoje vocês já têm alguém cuidando dessa parte?",
  ].join(" ");
}
