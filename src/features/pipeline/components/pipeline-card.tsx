"use client";

import { useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { pipelineStageLabel } from "@/features/opportunities/labels";
import { CONTACT_STAGE_LABEL, nextContactAction } from "@/lib/contact-flow";
import { formatAgo, formatDateTime, formatDueCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGE, type PipelineStage } from "@/types/domain";
import type { PipelineBoardRow } from "@/server/repositories/pipeline-repository";
import { moveStageAction } from "@/server/actions/pipeline";

const MOVABLE: PipelineStage[] = PIPELINE_STAGE.filter(
  (s) => s !== "new" && s !== "analyzed",
);
const TERMINAL: PipelineStage[] = ["client", "lost"];

/** Estágios terminais do contato — não há próxima ação a sugerir no card. */
const CONTACT_DONE = new Set(["closed"]);

export function PipelineCard({ company }: { company: PipelineBoardRow }) {
  const [isPending, startTransition] = useTransition();

  function move(to: PipelineStage) {
    // Reabrir cliente/perdido exige motivo (RN-08).
    let reason: string | undefined;
    if (TERMINAL.includes(company.pipeline_stage)) {
      const input = window.prompt(`Reabrir "${company.name}" exige um motivo:`);
      if (input == null || !input.trim()) return;
      reason = input.trim();
    }
    startTransition(async () => {
      const result = await moveStageAction(company.id, to, reason);
      if (!result.ok && result.error) window.alert(result.error);
    });
  }

  // Prazo do próximo follow-up pendente (não o next_action_at, que não é
  // mantido pelos lembretes). Atraso é a única condição que colore o card.
  const due = company.next_follow_up_at
    ? formatDueCompact(company.next_follow_up_at)
    : null;
  const subtitle =
    [company.city, company.primary_category].filter(Boolean).join(" · ") || "—";

  // Próxima ação do contato — só para estágios comerciais (não em cliente/perdido).
  const isCommercialStage =
    company.pipeline_stage !== "client" && company.pipeline_stage !== "lost";
  const action = nextContactAction(company.contact_stage);
  const showNextAction =
    isCommercialStage && !CONTACT_DONE.has(company.contact_stage);

  return (
    <div
      className={cn(
        "group/card relative overflow-hidden rounded-control border border-border-subtle bg-surface-2 p-3",
        "shadow-raise transition-[transform,box-shadow,border-color] duration-150",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-lift",
        "focus-within:border-border-strong focus-within:shadow-lift",
        isPending && "pointer-events-none opacity-40",
      )}
    >
      {due?.overdue ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] bg-danger"
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/opportunities/${company.id}`}
            className="block truncate text-meta font-semibold text-text-primary outline-none transition-colors hover:text-accent focus-visible:text-accent"
          >
            <span className="absolute inset-0 rounded-control" aria-hidden />
            {company.name}
          </Link>
          <p className="mt-1 truncate text-micro text-text-muted">{subtitle}</p>
        </div>
        {company.score !== null ? (
          <ScoreBadge score={company.score} meter={false} />
        ) : null}
      </div>

      {/* Estado do contato + próxima ação: é o que diferencia dois cards na
       * mesma coluna e diz ao operador o que fazer sem abrir a empresa. */}
      {isCommercialStage ? (
        <div className="mt-2.5 space-y-0.5">
          <p className="truncate text-micro font-medium text-text-secondary">
            {CONTACT_STAGE_LABEL[company.contact_stage]}
          </p>
          {showNextAction ? (
            <p className="truncate text-micro text-accent">→ {action.label}</p>
          ) : null}
        </div>
      ) : null}

      {/* Motivo do follow-up, quando houver. */}
      {company.next_follow_up_reason ? (
        <p className="mt-1.5 line-clamp-1 text-micro text-text-muted">
          {company.next_follow_up_reason}
        </p>
      ) : null}

      <div className="border-border-subtle/80 mt-3 flex h-6 items-center justify-between gap-2 border-t pt-2.5">
        {due ? (
          <span
            title={formatDateTime(company.next_follow_up_at)}
            className={cn(
              "truncate text-micro",
              due.overdue
                ? "font-medium text-danger"
                : due.today
                  ? "text-warning"
                  : "text-text-muted",
            )}
          >
            {due.label}
          </span>
        ) : (
          <span
            title={`No estágio desde ${formatDateTime(company.updated_at)}`}
            className="truncate text-micro text-text-muted"
          >
            {formatAgo(company.updated_at)}
          </span>
        )}

        <div className="relative shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                aria-label={`Mover ${company.name} de etapa`}
                className="focus-visible:ring-accent/40 flex size-6 items-center justify-center rounded-[6px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mover para</DropdownMenuLabel>
              {MOVABLE.filter((s) => s !== company.pipeline_stage).map((s) => (
                <DropdownMenuItem key={s} onSelect={() => move(s)}>
                  {pipelineStageLabel[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
