import type { BadgeProps } from "@/components/ui/badge";
import type { StatusTone } from "@/components/ui/status-dot";
import type { Priority, ReviewStatus, PipelineStage } from "@/types/domain";

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

export const reviewStatusLabel: Record<ReviewStatus, string> = {
  pending_analysis: "Em análise",
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
