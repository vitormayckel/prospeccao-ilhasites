"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/server/actions/templates";

export function DeleteTemplateButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm("Excluir este template?")) return;
    startTransition(async () => {
      const result = await deleteTemplateAction(id);
      if (!result.ok && result.error) window.alert(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label="Excluir template"
      className="hover:bg-danger/12 focus-visible:ring-danger/40 flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
