"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const result: RunSearchActionResult =
        mode === "test"
          ? await testSearchProfileAction(profileId)
          : await runSearchAction(profileId);

      if (!result.ok) {
        setIsError(true);
        setMessage(result.error ?? "Falha na execução.");
        return;
      }
      setIsError(false);
      const s = result.summary;
      if (s) {
        const label = s.reusedExistingRun
          ? "Execução já realizada hoje (idempotente)."
          : `${mode === "test" ? "Simulação" : "Coleta"}: ${s.newCompanies} novas · ${s.duplicates} duplicadas · ${s.suppressed} bloqueadas · ${s.failedItems} falhas.`;
        setMessage(label);
      }
      if (mode === "run") router.refresh();
    });
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
      {message ? (
        <span
          className={`text-xs ${isError ? "text-danger" : "text-text-secondary"}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
