"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronsRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { pipelineStageLabel } from "@/features/opportunities/labels";
import { formatAgo, formatDueLabel } from "@/lib/format";
import {
  PIPELINE_STAGE,
  type CompanyRow,
  type PipelineStage,
} from "@/types/domain";
import { moveStageAction } from "@/server/actions/pipeline";

const MOVABLE: PipelineStage[] = PIPELINE_STAGE.filter(
  (s) => s !== "new" && s !== "analyzed",
);
const TERMINAL: PipelineStage[] = ["client", "lost"];

export function PipelineCard({ company }: { company: CompanyRow }) {
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

  return (
    <div
      className={`rounded-control border border-border-subtle bg-surface-1 p-3 transition-opacity ${isPending ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/opportunities/${company.id}`}
          className="text-sm font-medium text-text-primary hover:text-accent"
        >
          {company.name}
        </Link>
        {company.score !== null ? <ScoreBadge score={company.score} /> : null}
      </div>
      <p className="mt-1 text-xs text-text-muted">{company.city ?? "—"}</p>
      <div className="mt-2 space-y-0.5 text-xs text-text-muted">
        <p>No estágio {formatAgo(company.updated_at)}</p>
        {company.next_action_at ? (
          <p className="text-text-secondary">
            Próxima ação: {formatDueLabel(company.next_action_at)}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              className="focus-visible:ring-accent/40 inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2"
            >
              <ChevronsRight className="size-3.5" />
              Mover
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
  );
}
