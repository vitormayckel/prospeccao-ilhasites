import type { BadgeProps } from "@/components/ui/badge";
import type { StatusTone } from "@/components/ui/status-dot";
import type {
  Priority,
  ReviewStatus,
  PipelineStage,
  ApproachChannel,
  ContactRole,
  NextActionStatus,
  WebsiteClass,
  CommercialPriority,
} from "@/types/domain";
import type { AnalysisState } from "@/server/repositories/companies-repository";

export const priorityLabel: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const priorityVariant: Record<Priority, BadgeProps["variant"]> = {
  low: "neutral",
  normal: "outline",
  high: "warning",
  urgent: "danger",
};

// Classificação comercial (migration 0011) ------------------------------
/** Classe do website. "none" = sem domínio próprio (sem site ou só rede). */
export const websiteClassLabel: Record<WebsiteClass, string> = {
  none: "Sem site",
  very_poor: "Site muito ruim",
  reasonable: "Site razoável",
  professional: "Site profissional",
};

/** Prioridade comercial A/B/C/D. A = maior urgência; D = menor. */
export const commercialPriorityLabel: Record<CommercialPriority, string> = {
  A: "Prioridade A",
  B: "Prioridade B",
  C: "Prioridade C",
  D: "Prioridade D",
};

export const commercialPriorityVariant: Record<
  CommercialPriority,
  BadgeProps["variant"]
> = {
  A: "danger", // maior urgência comercial → mais destaque
  B: "warning",
  C: "outline",
  D: "neutral", // fora da fila principal
};

/**
 * Rótulos finos do estado da análise (§11). `pending_analysis` sozinho é
 * ambíguo: não distingue "ainda não começou" de "rodando agora" nem de
 * "travou". A distinção vem de `analysis_state`, derivado por consulta.
 */
export const analysisStateLabel: Record<AnalysisState, string> = {
  awaiting: "Aguardando análise",
  running: "Em análise",
  stale: "Análise expirada",
  retry_pending: "Aguardando nova tentativa",
  desynced: "Análise concluída (revisar)",
};

export const analysisStateTone: Record<AnalysisState, StatusTone> = {
  awaiting: "neutral",
  running: "info",
  stale: "warning",
  retry_pending: "warning",
  desynced: "warning",
};

export const reviewStatusLabel: Record<ReviewStatus, string> = {
  pending_analysis: "Aguardando análise",
  analysis_failed: "Falha na análise",
  pending_review: "Aguardando",
  approved: "Aprovado",
  rejected: "Rejeitado",
  snoozed: "Adiado",
};

export const reviewStatusTone: Record<ReviewStatus, StatusTone> = {
  pending_analysis: "neutral",
  analysis_failed: "danger",
  pending_review: "info",
  approved: "success",
  rejected: "neutral",
  snoozed: "warning",
};

export const pipelineStageLabel: Record<PipelineStage, string> = {
  new: "Novo",
  analyzed: "Analisado",
  approved: "Aprovado",
  first_contact: "1ª abordagem",
  follow_up: "Follow-up",
  negotiation: "Negociação",
  client: "Cliente",
  lost: "Perdido",
};

/*
 * Tom por etapa. A progressão vai de neutro (entrada) a dourado (negociação,
 * o momento que mais pede atenção) e fecha em verde (cliente). "Perdido" é
 * deliberadamente apagado — ocupa espaço sem chamar o olho.
 */
export const pipelineStageTone: Record<PipelineStage, StatusTone> = {
  new: "neutral",
  analyzed: "neutral",
  approved: "info",
  first_contact: "info",
  follow_up: "warning",
  negotiation: "accent",
  client: "success",
  lost: "neutral",
};

// Operação comercial / CRM (Sprint 4) -----------------------------------
export const approachChannelLabel: Record<ApproachChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export const contactRoleLabel: Record<ContactRole, string> = {
  no_reply: "Não respondeu",
  reception: "Recepção",
  secretary: "Secretária",
  commercial: "Comercial",
  owner: "Dono",
  partner: "Sócio",
  manager: "Gerente",
  other: "Outro",
};

export const nextActionStatusLabel: Record<NextActionStatus, string> = {
  awaiting_reply: "Aguardando resposta",
  do_follow_up: "Fazer Follow-up",
  send_proposal: "Enviar proposta",
  call: "Ligar",
  schedule_meeting: "Agendar reunião",
  closed: "Encerrado",
};
