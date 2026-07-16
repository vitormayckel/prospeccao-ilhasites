"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Reply,
  MessageCircle,
  Check,
  Inbox,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { cn } from "@/lib/utils";
import { formatDueCompact } from "@/lib/format";
import { suggestGreeting } from "@/lib/greeting";
import { buildWhatsappDeepLink } from "@/lib/whatsapp-link";
import type {
  TodayQueueItem,
  QueueActionKind,
} from "@/server/repositories/dashboard-repository";
import {
  openGreetingAction,
  confirmGreetingSentAction,
  confirmCommercialSentAction,
} from "@/server/actions/contact";
import { completeFollowUpAction } from "@/server/actions/opportunities";

type Tone = "danger" | "warning" | "accent" | "info" | "neutral";

const KIND_META: Record<
  QueueActionKind,
  { label: string; icon: LucideIcon; tone: Tone }
> = {
  follow_up_overdue: { label: "Follow-up atrasado", icon: AlertTriangle, tone: "danger" },
  follow_up_today: { label: "Follow-up de hoje", icon: CalendarClock, tone: "warning" },
  reply_awaiting_commercial: { label: "Respondeu", icon: Reply, tone: "accent" },
  message_awaiting_send: { label: "Aguardando envio", icon: MessageCircle, tone: "warning" },
  greeting_pending: { label: "Saudação pendente", icon: MessageCircle, tone: "info" },
  review_pending: { label: "Revisão pendente", icon: Inbox, tone: "neutral" },
  search_alert: { label: "Alerta de coleta", icon: AlertTriangle, tone: "danger" },
};

const toneDot: Record<Tone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
  info: "bg-info",
  neutral: "bg-text-muted/50",
};

export function TodayQueue({ items }: { items: TodayQueueItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await fn();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Falha ao processar a ação.");
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Fila zerada"
        description="Nenhuma tarefa pendente agora. Novos follow-ups, respostas e revisões aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {error ? <p className="text-micro text-danger">{error}</p> : null}
      {items.map((item, i) => {
        const meta = KIND_META[item.kind];
        const Icon = meta.icon;
        const rowId = item.follow_up_id ?? item.company_id ?? `alert-${i}`;
        const busy = isPending && pendingId === rowId;
        const phone = item.phone_e164 ?? item.phone_raw ?? null;

        return (
          <div
            key={rowId}
            className={cn(
              "flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between",
              busy && "pointer-events-none opacity-50",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneDot[meta.tone])}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-micro font-medium uppercase tracking-wide text-text-muted">
                    {meta.label}
                  </span>
                  {item.score !== null ? (
                    <ScoreBadge score={item.score} meter={false} />
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-body font-medium text-text-primary">
                  {item.company_id ? (
                    <Link
                      href={`/opportunities/${item.company_id}`}
                      className="outline-none transition-colors hover:text-accent focus-visible:text-accent"
                    >
                      {item.company_name}
                    </Link>
                  ) : (
                    item.company_name
                  )}
                </p>
                <p className="mt-0.5 truncate text-micro text-text-muted">
                  {contextLine(item)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <QueueCta
                item={item}
                phone={phone}
                busy={busy}
                onGreeting={() => {
                  const greeting = suggestGreeting();
                  if (!phone) {
                    setError("Sem telefone válido para abrir o WhatsApp.");
                    return;
                  }
                  const link = buildWhatsappDeepLink(phone, greeting);
                  if (!link) {
                    setError("Telefone inválido — não é possível abrir o WhatsApp.");
                    return;
                  }
                  window.open(link, "_blank", "noopener,noreferrer");
                  run(rowId, () =>
                    openGreetingAction({
                      companyId: item.company_id!,
                      content: greeting,
                      phoneE164: phone,
                    }),
                  );
                }}
                onConfirmSend={() => {
                  if (!item.message_id) return;
                  const confirm =
                    item.contact_stage === "commercial_prepared"
                      ? confirmCommercialSentAction
                      : confirmGreetingSentAction;
                  run(rowId, () => confirm(item.message_id!));
                }}
                onCompleteFollowUp={() =>
                  item.follow_up_id &&
                  run(rowId, () => completeFollowUpAction(item.follow_up_id!))
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function contextLine(item: TodayQueueItem): string {
  if (item.kind === "follow_up_overdue" || item.kind === "follow_up_today") {
    const due = item.due_at ? formatDueCompact(item.due_at).label : "";
    return [due, item.reason].filter(Boolean).join(" · ") || "Follow-up agendado";
  }
  if (item.kind === "search_alert") {
    return item.reason ?? "Falha na coleta/análise";
  }
  const stageText: Partial<Record<QueueActionKind, string>> = {
    reply_awaiting_commercial: "Prepare a mensagem comercial",
    message_awaiting_send: "Preparada — confirme após enviar",
    greeting_pending: "Envie só a saudação, sem conteúdo comercial",
    review_pending: "Aguardando sua decisão",
  };
  return stageText[item.kind] ?? "";
}

interface CtaProps {
  item: TodayQueueItem;
  phone: string | null;
  busy: boolean;
  onGreeting: () => void;
  onConfirmSend: () => void;
  onCompleteFollowUp: () => void;
}

function QueueCta({
  item,
  phone,
  busy,
  onGreeting,
  onConfirmSend,
  onCompleteFollowUp,
}: CtaProps) {
  switch (item.kind) {
    case "follow_up_overdue":
    case "follow_up_today":
      return (
        <>
          <Button size="sm" variant="secondary" onClick={onCompleteFollowUp} disabled={busy}>
            <Check />
            Concluir
          </Button>
          <CompanyLink id={item.company_id} label="Abrir" />
        </>
      );
    case "greeting_pending":
      return (
        <Button size="sm" onClick={onGreeting} disabled={busy || !phone}>
          <MessageCircle />
          {phone ? "Abrir WhatsApp" : "Sem telefone"}
        </Button>
      );
    case "message_awaiting_send":
      return (
        <>
          <Button size="sm" onClick={onConfirmSend} disabled={busy || !item.message_id}>
            <Check />
            Confirmar envio
          </Button>
          <CompanyLink id={item.company_id} label="Abrir" />
        </>
      );
    case "reply_awaiting_commercial":
      return <CompanyLink id={item.company_id} label="Preparar mensagem" primary />;
    case "review_pending":
      return <CompanyLink id={item.company_id} label="Revisar" primary icon={ClipboardList} />;
    case "search_alert":
      return (
        <Button size="sm" variant="secondary" asChild>
          <Link href="/settings/searches">
            Ver
            <ArrowRight />
          </Link>
        </Button>
      );
  }
}

function CompanyLink({
  id,
  label,
  primary,
  icon: Icon,
}: {
  id: string | null;
  label: string;
  primary?: boolean;
  icon?: LucideIcon;
}) {
  if (!id) return null;
  return (
    <Button size="sm" variant={primary ? "primary" : "ghost"} asChild>
      <Link href={`/opportunities/${id}`}>
        {Icon ? <Icon /> : null}
        {label}
        {primary ? <ArrowRight /> : null}
      </Link>
    </Button>
  );
}
