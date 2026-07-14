"use client";

import { Play, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import {
  runSearchAction,
  testSearchProfileAction,
  type RunSearchActionResult,
} from "@/server/actions/search-profiles";

interface RunSearchButtonProps {
  profileId: string;
  mode?: "run" | "test";
  size?: "sm" | "md";
}

/** Dispara a coleta (ou o teste sem persistir) e mostra o resumo do resultado. */
export function RunSearchButton({
  profileId,
  mode = "run",
  size = "sm",
}: RunSearchButtonProps) {
  const { isPending, error, message, run } = useAsyncAction();

  function summaryLabel(result: RunSearchActionResult): string {
    const s = result.summary;
    if (!s) return "";
    return s.reusedExistingRun
      ? "Execução já realizada hoje (idempotente)."
      : `${mode === "test" ? "Simulação" : "Coleta"}: ${s.newCompanies} novas · ${s.duplicates} duplicadas · ${s.suppressed} bloqueadas · ${s.failedItems} falhas.`;
  }

  function onClick() {
    run(
      () =>
        mode === "test"
          ? testSearchProfileAction(profileId)
          : runSearchAction(profileId),
      { successMessage: summaryLabel, refresh: mode === "run" },
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={mode === "test" ? "ghost" : "secondary"}
        size={size}
        disabled={isPending}
        onClick={onClick}
      >
        {mode === "test" ? <FlaskConical /> : <Play />}
        {isPending
          ? "Executando..."
          : mode === "test"
            ? "Testar"
            : "Executar agora"}
      </Button>
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : message ? (
        <span className="text-xs text-text-secondary">{message}</span>
      ) : null}
    </div>
  );
}
