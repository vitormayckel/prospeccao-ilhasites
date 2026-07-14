/**
 * Dados fictícios apenas para a fundação visual (Fase 1).
 * Nada aqui vem do banco. Serão substituídos por consultas reais nas fases seguintes.
 */

import {
  Inbox,
  Send,
  CalendarClock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export type PriorityKind = "follow_up" | "approach" | "review";

export type StatIntent = "default" | "accent" | "danger";

export interface PriorityItem {
  id: string;
  kind: PriorityKind;
  company: string;
  detail: string;
}

export interface StatItem {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  intent: StatIntent;
}

export interface MetricItem {
  id: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

export const summaryStats: StatItem[] = [
  {
    id: "review",
    label: "Aguardando análise",
    value: "12",
    hint: "empresas",
    icon: Inbox,
    intent: "default",
  },
  {
    id: "messages",
    label: "Mensagens pendentes",
    value: "7",
    hint: "aprovadas",
    icon: Send,
    intent: "accent",
  },
  {
    id: "followups",
    label: "Follow-ups de hoje",
    value: "3",
    hint: "agendados",
    icon: CalendarClock,
    intent: "default",
  },
  {
    id: "overdue",
    label: "Atrasados",
    value: "1",
    hint: "follow-up",
    icon: AlertTriangle,
    intent: "danger",
  },
];

export const priorities: PriorityItem[] = [
  {
    id: "p1",
    kind: "follow_up",
    company: "Clínica Aurora",
    detail: "Follow-up agendado para 09:30",
  },
  {
    id: "p2",
    kind: "approach",
    company: "Lima Contabilidade",
    detail: "Aprovada — primeira abordagem pendente",
  },
  {
    id: "p3",
    kind: "review",
    company: "Advocacia Norte",
    detail: "Score 82 — aguardando revisão",
  },
  {
    id: "p4",
    kind: "review",
    company: "Studio Vega",
    detail: "Score 76 — aguardando revisão",
  },
];

export const searchActivity = {
  city: "Vitória",
  found: 42,
  lastRun: "07:00",
  status: "concluída" as const,
};

export const monthlyMetrics: MetricItem[] = [
  { id: "found", label: "Encontradas", value: "318" },
  { id: "approached", label: "Abordadas", value: "94" },
  { id: "replies", label: "Respostas", value: "37" },
  { id: "clients", label: "Clientes", value: "6" },
  { id: "conversion", label: "Conversão", value: "6,4%", emphasis: true },
];
