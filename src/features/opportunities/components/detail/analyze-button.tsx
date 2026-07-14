"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { analyzeCompanyAction } from "@/server/actions/analysis";

/** Dispara (ou reprocessa) a análise de IA de uma empresa. */
export function AnalyzeButton({
  companyId,
  hasAnalysis,
}: {
  companyId: string;
  hasAnalysis: boolean;
}) {
  const { isPending, error, run } = useAsyncAction();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => run(() => analyzeCompanyAction(companyId))}
      >
        <Sparkles />
        {isPending
          ? "Analisando..."
          : hasAnalysis
            ? "Reprocessar análise"
            : "Analisar com IA"}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
