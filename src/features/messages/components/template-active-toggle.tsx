"use client";

import { useTransition } from "react";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTemplateActiveAction } from "@/server/actions/templates";

/** Ativa/desativa um template. Desativado não some da biblioteca — só deixa
 *  de ser oferecido nas abordagens. */
export function TemplateActiveToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await setTemplateActiveAction(id, !active);
      if (!result.ok && result.error) window.alert(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={active}
      aria-label={active ? "Desativar template" : "Ativar template"}
      title={active ? "Desativar" : "Ativar"}
      className={cn(
        "flex size-7 items-center justify-center rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50",
        active
          ? "text-success hover:bg-success/10"
          : "text-text-muted hover:bg-surface-3 hover:text-text-secondary",
      )}
    >
      <Power className="size-3.5" />
    </button>
  );
}
