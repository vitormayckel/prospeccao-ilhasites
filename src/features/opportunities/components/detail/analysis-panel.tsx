import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  dotClass,
}: {
  title: string;
  items: ProspectAnalysis["positives"];
  dotClass: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <ul className="space-y-2 text-meta leading-relaxed text-text-secondary">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              aria-hidden
              className={cn("mt-[7px] size-1 shrink-0 rounded-full", dotClass)}
            />
            <span className="min-w-0">{item.text}</span>
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant={rec.variant}>{rec.label}</Badge>
        <span className="text-micro text-text-muted">
          {CONFIDENCE_LABEL[output.confidence]}
        </span>
      </div>

      {/* O veredito é a primeira coisa lida — tratado como lead editorial. */}
      <p className="rule-accent pl-4 text-body leading-relaxed text-text-primary">
        {output.executive_summary}
      </p>

      <div>
        <p className="eyebrow mb-3">Composição do score</p>
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {output.score_breakdown.map((d, i) => {
            const pct =
              d.max_points > 0
                ? Math.round((d.points / d.max_points) * 100)
                : 0;
            return (
              <div key={i} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-meta text-text-primary">
                    {d.dimension}
                  </span>
                  {/* A proporção se lê antes do número. */}
                  <span
                    aria-hidden
                    className="hidden h-[3px] w-24 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:block"
                  >
                    <span
                      className="bg-accent/70 block h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="tnum shrink-0 font-mono text-micro text-text-secondary">
                    {d.points}/{d.max_points}
                  </span>
                </div>
                <p className="mt-1.5 text-micro leading-relaxed text-text-muted">
                  {d.explanation}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
        <EvidenceList
          title="Pontos positivos"
          items={output.positives}
          dotClass="bg-success"
        />
        <EvidenceList
          title="Pontos de atenção"
          items={output.risks}
          dotClass="bg-warning"
        />
        <EvidenceList
          title="Oportunidades"
          items={output.opportunities}
          dotClass="bg-accent"
        />
        <EvidenceList
          title="Argumentos de venda"
          items={output.sales_arguments}
          dotClass="bg-info"
        />
      </div>

      {output.missing_data.length > 0 ? (
        <div>
          <p className="eyebrow mb-3">Dados ausentes</p>
          <div className="flex flex-wrap gap-1.5">
            {output.missing_data.map((m, i) => (
              <Badge key={i} variant="outline">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {output.cautions.length > 0 ? (
        <ul className="space-y-1 border-t border-border-subtle pt-4 text-micro leading-relaxed text-text-muted">
          {output.cautions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
