"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { analyzePendingAction } from "@/server/actions/analysis";

/** Analisa em lote as empresas aguardando análise de IA. */
export function AnalyzePendingButton({ pending }: { pending: number }) {
  const { isPending, error, message, run } = useAsyncAction();

  function onClick() {
    run(() => analyzePendingAction(), {
      successMessage: (r) =>
        `${r.analyzed ?? 0} analisadas · ${r.failed ?? 0} falhas.`,
    });
  }

  if (pending === 0 && !message && !error) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending || pending === 0}
        onClick={onClick}
      >
        <Sparkles />
        {isPending ? "Analisando..." : `Analisar pendentes (${pending})`}
      </Button>
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : message ? (
        <span className="text-xs text-text-secondary">{message}</span>
      ) : null}
    </div>
  );
}
