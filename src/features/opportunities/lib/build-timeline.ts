import type { CompanyDetail } from "@/server/repositories/companies-repository";
import type {
  ApproachChannel,
  ContactRole,
  NextActionStatus,
} from "@/types/domain";
import { MESSAGE_KIND_LABEL } from "@/lib/message-kind";
import {
  pipelineStageLabel,
  approachChannelLabel,
  contactRoleLabel,
  nextActionStatusLabel,
} from "@/features/opportunities/labels";

export type TimelineTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail?: string | null;
  tone: TimelineTone;
}

const DECISION: Record<string, { title: string; tone: TimelineTone }> = {
  approved: { title: "Empresa aprovada", tone: "success" },
  rejected: { title: "Empresa rejeitada", tone: "danger" },
  snoozed: { title: "Empresa adiada", tone: "warning" },
  reactivated: { title: "Empresa reativada", tone: "info" },
};

const MESSAGE_STATUS_VERB: Record<string, string> = {
  draft: "em rascunho",
  opened: "preparada (WhatsApp aberto)",
  confirmed_sent: "enviada",
  not_sent: "não enviada",
};

/**
 * Monta o histórico cronológico da oportunidade a partir das fontes que já
 * persistem (Sprint 4, §1) — sem tabela nova. Mais recente primeiro. Novos
 * tipos de evento podem entrar por audit_events sem mudar esta função.
 */
export function buildTimeline(detail: CompanyDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const {
    company,
    analyses,
    decisions,
    notes,
    messages,
    followUps,
    pipelineEvents,
    auditEvents,
  } = detail;

  // Criação
  events.push({
    id: `created-${company.id}`,
    at: company.created_at,
    title: "Empresa criada",
    detail:
      [company.primary_category, company.city].filter(Boolean).join(" · ") ||
      null,
    tone: "neutral",
  });

  // Análises de IA
  for (const a of analyses) {
    if (a.status === "completed") {
      events.push({
        id: `ai-${a.id}`,
        at: a.completed_at ?? a.created_at,
        title: "IA analisou",
        detail: a.score !== null ? `Score ${a.score}` : null,
        tone: "accent",
      });
    } else if (a.status === "failed") {
      events.push({
        id: `ai-${a.id}`,
        at: a.completed_at ?? a.created_at,
        title: "Análise falhou",
        detail: a.error_message,
        tone: "danger",
      });
    }
  }

  // Decisões de revisão
  for (const d of decisions) {
    const meta = DECISION[d.decision] ?? {
      title: "Decisão registrada",
      tone: "neutral" as TimelineTone,
    };
    events.push({
      id: `decision-${d.id}`,
      at: d.created_at,
      title: meta.title,
      detail: d.reason,
      tone: meta.tone,
    });
  }

  // Movimentações de estágio
  for (const e of pipelineEvents) {
    events.push({
      id: `stage-${e.id}`,
      at: e.created_at,
      title: e.from_stage
        ? `${pipelineStageLabel[e.from_stage]} → ${pipelineStageLabel[e.to_stage]}`
        : pipelineStageLabel[e.to_stage],
      detail: e.reason,
      tone: "info",
    });
  }

  // Mensagens (saudação / comercial / follow-up)
  for (const m of messages) {
    const verb = MESSAGE_STATUS_VERB[m.status] ?? m.status;
    events.push({
      id: `msg-${m.id}`,
      at: m.sent_at ?? m.opened_at ?? m.created_at,
      title: `${MESSAGE_KIND_LABEL[m.type]} — ${verb}`,
      detail: null,
      tone: m.status === "confirmed_sent" ? "success" : "neutral",
    });
  }

  // Follow-ups (criados e concluídos)
  for (const f of followUps) {
    events.push({
      id: `fu-${f.id}`,
      at: f.created_at,
      title: "Follow-up criado",
      detail: f.notes,
      tone: "warning",
    });
    if (f.status === "completed" && f.completed_at) {
      events.push({
        id: `fu-done-${f.id}`,
        at: f.completed_at,
        title: "Follow-up concluído",
        detail: null,
        tone: "success",
      });
    }
  }

  // Notas
  for (const n of notes) {
    events.push({
      id: `note-${n.id}`,
      at: n.created_at,
      title: "Nota adicionada",
      detail: n.content,
      tone: "neutral",
    });
  }

  // Mudanças de campo operacional (audit_events)
  for (const ev of auditEvents) {
    const to = (ev.metadata?.to ?? null) as string | null;
    if (ev.action === "approach_channel_changed") {
      events.push({
        id: `audit-${ev.id}`,
        at: ev.created_at,
        title: "Canal alterado",
        detail: to ? approachChannelLabel[to as ApproachChannel] : null,
        tone: "info",
      });
    } else if (ev.action === "contact_role_changed") {
      events.push({
        id: `audit-${ev.id}`,
        at: ev.created_at,
        title: "Contato classificado",
        detail: to ? contactRoleLabel[to as ContactRole] : "Removido",
        tone: "info",
      });
    } else if (ev.action === "next_action_changed") {
      events.push({
        id: `audit-${ev.id}`,
        at: ev.created_at,
        title: "Próxima ação alterada",
        detail: to ? nextActionStatusLabel[to as NextActionStatus] : "Removida",
        tone: "info",
      });
    }
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
