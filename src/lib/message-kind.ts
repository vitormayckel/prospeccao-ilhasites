// =====================================================================
// Categorias de mensagem/template (fonte única de rótulos e ajuda).
// Antes esses rótulos viviam duplicados em 3 telas — centralizados aqui
// para não divergirem (§1.4, §6).
// =====================================================================

import type { MessageKind } from "@/types/domain";

/** Ordem de exibição das categorias na biblioteca (§1). */
export const MESSAGE_KIND_ORDER: MessageKind[] = [
  "greeting",
  "first_contact",
  "follow_up",
  "after_conversation",
  "reactivation",
  "last_attempt",
];

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  greeting: "Saudação inicial",
  first_contact: "Mensagem após resposta",
  follow_up: "Follow-up sem resposta",
  after_conversation: "Follow-up após conversa",
  reactivation: "Reativação",
  last_attempt: "Despedida elegante",
};

/** Quando usar cada categoria (texto de ajuda na biblioteca). */
export const MESSAGE_KIND_HELP: Record<MessageKind, string> = {
  greeting:
    "Somente o primeiro contato: uma saudação curta, sem conteúdo comercial. Ex.: “Bom dia!”, “Olá, tudo bem?”.",
  first_contact:
    "Enviada só depois que o lead responde. Agradece, dá contexto e faz uma pergunta de descoberta.",
  follow_up:
    "Lembrete educado quando a saudação não teve resposta. Retoma o contato sem pressionar.",
  after_conversation:
    "Retoma uma conversa que já andou e esfriou — recupera o que ficou combinado.",
  reactivation:
    "Reaproxima um lead antigo que ficou parado, com um novo motivo para conversar.",
  last_attempt:
    "Encerra o ciclo com elegância quando não há retorno, deixando a porta aberta.",
};

/** A categoria padrão do primeiro contato (§1). */
export const DEFAULT_TEMPLATE_KIND: MessageKind = "greeting";

/**
 * Categorias com conteúdo comercial — indisponíveis antes do lead responder
 * (§1). "greeting" é a única liberada no primeiro contato.
 */
export const COMMERCIAL_KINDS: MessageKind[] = MESSAGE_KIND_ORDER.filter(
  (k) => k !== "greeting",
);
