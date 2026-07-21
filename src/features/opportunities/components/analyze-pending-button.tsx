"use client";

import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { analyzePendingAction } from "@/server/actions/analysis";

/**
 * Recuperação administrativa da fila de análise.
 *
 * NÃO faz parte do fluxo normal: desde a FASE 2 a análise é disparada
 * automaticamente pelo pipeline persistente, logo após a deduplicação. Este
 * botão existe para destravar registros antigos ou execuções interrompidas —
 * por isso só aparece quando há de fato algo pendente.
 *
 * O lote é limitado por tempo no servidor para caber no teto da função
 * serverless; o resumo informa o que ficou pendente em vez de sugerir que a
 * fila inteira foi processada.
 */
export function AnalyzePendingButton({ pending }: { pending: number }) {
  const { isPending, error, message, run } = useAsyncAction();

  function onClick() {
    run(() => analyzePendingAction(), {
      successMessage: (r) => {
        const parts = [`${r.analyzed ?? 0} analisadas`];
        if (r.failed) parts.push(`${r.failed} falhas`);
        if (r.recovered) parts.push(`${r.recovered} recuperadas`);
        if (r.remaining) parts.push(`${r.remaining} na fila`);
        return parts.join(" · ") + ".";
      },
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
        <LifeBuoy />
        {isPending ? "Recuperando..." : `Recuperar análises (${pending})`}
      </Button>
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : message ? (
        <span className="text-xs text-text-secondary">{message}</span>
      ) : null}
    </div>
  );
}
