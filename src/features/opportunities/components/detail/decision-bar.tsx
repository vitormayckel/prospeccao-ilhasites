"use client";

import { useTransition } from "react";
import { Check, Clock, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewStatus } from "@/types/domain";
import {
  approveCompanyAction,
  rejectCompanyAction,
  snoozeCompanyAction,
  reactivateCompanyAction,
  type ActionResult,
} from "@/server/actions/opportunities";

export function DecisionBar({
  companyId,
  reviewStatus,
}: {
  companyId: string;
  reviewStatus: ReviewStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.error) window.alert(result.error);
    });
  }

  const canDecide =
    reviewStatus === "pending_review" ||
    reviewStatus === "pending_analysis" ||
    reviewStatus === "analysis_failed";
  const canReactivate =
    reviewStatus === "rejected" || reviewStatus === "snoozed";

  if (canReactivate) {
    return (
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          run(() => reactivateCompanyAction(companyId, "Reativado manualmente"))
        }
      >
        <RotateCcw />
        Reativar
      </Button>
    );
  }

  if (!canDecide) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={isPending}
        onClick={() => run(() => approveCompanyAction(companyId))}
      >
        <Check />
        Aprovar
      </Button>
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() => run(() => snoozeCompanyAction(companyId, 7))}
      >
        <Clock />
        Adiar
      </Button>
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => run(() => rejectCompanyAction(companyId))}
      >
        <X />
        Rejeitar
      </Button>
    </div>
  );
}
