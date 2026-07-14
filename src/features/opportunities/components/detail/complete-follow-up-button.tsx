"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { completeFollowUpAction } from "@/server/actions/opportunities";

/** Conclui um follow-up pendente (RF-13). */
export function CompleteFollowUpButton({ followUpId }: { followUpId: string }) {
  const { isPending, run } = useAsyncAction();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => run(() => completeFollowUpAction(followUpId))}
    >
      <Check />
      {isPending ? "..." : "Concluir"}
    </Button>
  );
}
