import { cn } from "@/lib/utils";

export interface RunSummaryData {
  status: string;
  requested: number;
  resultsSeen: number;
  newCompanies: number;
  duplicates: number;
  suppressed: number;
  failedItems: number;
  noPhone: number;
  reusedExistingRun: boolean;
}

/** Linha do funil com "leader dots" (rótulo .... valor), como no relatório. */
function Row({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  tone?: "default" | "strong" | "muted";
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn(
          "shrink-0 text-micro",
          tone === "muted" ? "text-text-muted" : "text-text-secondary",
        )}
        title={hint}
      >
        {label}
      </span>
      <span
        aria-hidden
        className="min-w-4 flex-1 translate-y-[-2px] border-b border-dotted border-border"
      />
      <span
        className={cn(
          "tnum shrink-0 font-mono text-micro",
          tone === "strong"
            ? "font-semibold text-text-primary"
            : tone === "muted"
              ? "text-text-muted"
              : "text-text-secondary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Resumo transparente da coleta (Sprint 2). Reconcilia o funil da execução:
 * Solicitadas → Google retornou → descartes por motivo → Importadas. Não
 * esconde nenhuma etapa.
 */
export function RunSummary({
  data,
  mode = "run",
}: {
  data: RunSummaryData;
  mode?: "run" | "test";
}) {
  if (data.reusedExistingRun) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-1 px-3 py-2.5 text-micro text-text-secondary">
        Execução já realizada hoje — dados reaproveitados (idempotente).
      </div>
    );
  }

  return (
    <div className="w-full min-w-[13rem] max-w-xs space-y-1.5 rounded-card border border-border-subtle bg-surface-1 px-3 py-2.5">
      <p className="eyebrow mb-1">
        {mode === "test" ? "Simulação da coleta" : "Resumo da coleta"}
      </p>
      <Row label="Solicitadas" value={data.requested} />
      <Row label="Google retornou" value={data.resultsSeen} />
      <Row label="Duplicadas" value={data.duplicates} tone="muted" />
      <Row label="Bloqueadas" value={data.suppressed} tone="muted" />
      <Row
        label="Descartadas pela IA"
        value={0}
        tone="muted"
        hint="A avaliação por IA ocorre após a importação — não descarta na coleta."
      />
      {data.failedItems > 0 ? (
        <Row label="Falhas" value={data.failedItems} tone="muted" />
      ) : null}
      <div className="mt-1 border-t border-border-subtle pt-1.5">
        <Row label="Importadas" value={data.newCompanies} tone="strong" />
      </div>
      {data.noPhone > 0 ? (
        <p className="pt-0.5 text-micro text-warning">
          {data.noPhone} sem telefone — importadas, mas não contactáveis por
          WhatsApp.
        </p>
      ) : null}
    </div>
  );
}
