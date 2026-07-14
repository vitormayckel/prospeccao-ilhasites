/** Dados fictícios da fila de oportunidades (Fase 1 — apenas visual). */

export type ReviewStatus =
  "pending_review" | "approved" | "snoozed" | "rejected";

export type Priority = "low" | "normal" | "high" | "urgent";

export interface OpportunityRow {
  id: string;
  name: string;
  city: string;
  category: string;
  score: number;
  priority: Priority;
  status: ReviewStatus;
}

export const priorityLabel: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const statusLabel: Record<ReviewStatus, string> = {
  pending_review: "Aguardando",
  approved: "Aprovado",
  snoozed: "Adiado",
  rejected: "Rejeitado",
};

export const opportunities: OpportunityRow[] = [
  {
    id: "1",
    name: "Clínica Aurora",
    city: "Vitória",
    category: "Clínica médica",
    score: 82,
    priority: "high",
    status: "pending_review",
  },
  {
    id: "2",
    name: "Lima & Lima Contabilidade",
    city: "Vila Velha",
    category: "Contabilidade",
    score: 74,
    priority: "normal",
    status: "approved",
  },
  {
    id: "3",
    name: "Advocacia Norte",
    city: "Serra",
    category: "Advocacia",
    score: 68,
    priority: "normal",
    status: "pending_review",
  },
  {
    id: "4",
    name: "Studio Vega",
    city: "Vitória",
    category: "Estúdio de design",
    score: 61,
    priority: "low",
    status: "snoozed",
  },
  {
    id: "5",
    name: "Odonto Sorriso",
    city: "Cariacica",
    category: "Odontologia",
    score: 55,
    priority: "normal",
    status: "rejected",
  },
];
