"use client";

import { useState } from "react";
import { Play, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import {
  RunSummary,
  type RunSummaryData,
} from "@/features/searches/components/run-summary";
import {
  runSearchAction,
  testSearchProfileAction,
} from "@/server/actions/search-profiles";

interface RunSearchButtonProps {
  profileId: string;
  mode?: "run" | "test";
  size?: "sm" | "md";
}

/** Dispara a coleta (ou o teste sem persistir) e mostra o resumo transparente
 *  da execução — o funil completo de Solicitadas a Importadas (Sprint 2). */
export function RunSearchButton({
  profileId,
  mode = "run",
  size = "sm",
}: RunSearchButtonProps) {
  const { isPending, error, run } = useAsyncAction();
  const [summary, setSummary] = useState<RunSummaryData | null>(null);

  function onClick() {
    setSummary(null);
    run(
      () =>
        mode === "test"
          ? testSearchProfileAction(profileId)
          : runSearchAction(profileId),
      {
        refresh: mode === "run",
        onSuccess: (result) => setSummary(result.summary ?? null),
      },
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
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
      ) : summary ? (
        <RunSummary data={summary} mode={mode} />
      ) : null}
    </div>
  );
}
