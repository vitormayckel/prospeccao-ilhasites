"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { PRIORITY, type Priority, type ReviewStatus } from "@/types/domain";
import { priorityLabel } from "@/features/opportunities/labels";
import {
  approveCompanyAction,
  rejectCompanyAction,
  snoozeCompanyAction,
  reactivateCompanyAction,
  setPriorityAction,
  type ActionResult,
} from "@/server/actions/opportunities";

interface RowActionsProps {
  companyId: string;
  reviewStatus: ReviewStatus;
}

export function RowActions({ companyId, reviewStatus }: RowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.error) {
        window.alert(result.error);
      }
    });
  }

  const canDecide =
    reviewStatus === "pending_review" ||
    reviewStatus === "pending_analysis" ||
    reviewStatus === "analysis_failed";
  const canReactivate =
    reviewStatus === "rejected" || reviewStatus === "snoozed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Ações"
          disabled={isPending}
          className="focus-visible:ring-accent/40 flex size-8 items-center justify-center rounded-control text-text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          {isPending ? <Spinner /> : <MoreHorizontal className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => router.push(`/opportunities/${companyId}`)}
        >
          Ver detalhes
        </DropdownMenuItem>

        {canDecide ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => run(() => approveCompanyAction(companyId))}
            >
              Aprovar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => run(() => snoozeCompanyAction(companyId, 7))}
            >
              Adiar 7 dias
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => run(() => rejectCompanyAction(companyId))}
            >
              Rejeitar
            </DropdownMenuItem>
          </>
        ) : null}

        {canReactivate ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                run(() =>
                  reactivateCompanyAction(companyId, "Reativado manualmente"),
                )
              }
            >
              Reativar
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Prioridade</DropdownMenuLabel>
        {PRIORITY.map((p: Priority) => (
          <DropdownMenuItem
            key={p}
            onSelect={() => run(() => setPriorityAction(companyId, p))}
          >
            {priorityLabel[p]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
