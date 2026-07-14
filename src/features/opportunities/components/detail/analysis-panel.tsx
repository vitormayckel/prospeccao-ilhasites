import { Badge } from "@/components/ui/badge";
import type { ProspectAnalysis } from "@/types/domain";

const RECOMMENDATION: Record<
  ProspectAnalysis["recommendation"],
  { label: string; variant: "success" | "info" | "neutral" }
> = {
  prioritize: { label: "Priorizar", variant: "success" },
  review: { label: "Revisar", variant: "info" },
  low_priority: { label: "Baixa prioridade", variant: "neutral" },
};

const CONFIDENCE_LABEL: Record<ProspectAnalysis["confidence"], string> = {
  high: "confiança alta",
  medium: "confiança média",
  low: "confiança baixa",
};

function EvidenceList({
  title,
  items,
}: {
  title: string;
  items: ProspectAnalysis["positives"];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <ul className="space-y-1.5 text-sm text-text-secondary">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-text-muted">•</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renderiza o contrato de análise (Blueprint §9.5) por completo. */
export function AnalysisPanel({ output }: { output: ProspectAnalysis }) {
  const rec = RECOMMENDATION[output.recommendation];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rec.variant}>{rec.label}</Badge>
        <Badge variant="neutral">{CONFIDENCE_LABEL[output.confidence]}</Badge>
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">
        {output.executive_summary}
      </p>

      <div className="space-y-2">
        {output.score_breakdown.map((d, i) => (
          <div key={i} className="bg-surface-2/40 rounded-control p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">{d.dimension}</span>
              <span className="tnum text-text-secondary">
                {d.points}/{d.max_points}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">{d.explanation}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <EvidenceList title="Pontos positivos" items={output.positives} />
        <EvidenceList title="Pontos de atenção" items={output.risks} />
        <EvidenceList title="Oportunidades" items={output.opportunities} />
        <EvidenceList
          title="Argumentos de venda"
          items={output.sales_arguments}
        />
      </div>

      {output.missing_data.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Dados ausentes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {output.missing_data.map((m, i) => (
              <Badge key={i} variant="neutral">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {output.cautions.length > 0 ? (
        <ul className="space-y-1 border-t border-border-subtle pt-3 text-xs text-text-muted">
          {output.cautions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
