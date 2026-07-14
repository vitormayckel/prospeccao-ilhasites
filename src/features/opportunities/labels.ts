import type { BadgeProps } from "@/components/ui/badge";
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

export const reviewStatusDot: Record<ReviewStatus, string> = {
  pending_analysis: "bg-text-muted",
  analysis_failed: "bg-danger",
  pending_review: "bg-info",
  approved: "bg-success",
  rejected: "bg-text-muted",
  snoozed: "bg-warning",
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
