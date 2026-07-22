import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  commercialPriorityLabel,
  commercialPriorityVariant,
  websiteClassLabel,
} from "@/features/opportunities/labels";
import { WEBSITE_CLASS_TO_PRIORITY } from "@/types/domain";
import type { CompanyRow } from "@/types/domain";

/** Cor discreta por efeito do fator no score. */
const effectClass: Record<"+" | "-" | "=", string> = {
  "+": "text-success",
  "-": "text-danger",
  "=": "text-text-muted",
};

/**
 * Classificação comercial da empresa (migration 0011): score comercial,
 * prioridade A/B/C/D derivada da classe do site e os fatores que explicam o
 * score. A classe do site é UM fator, não o critério único.
 */
export function CommercialClassification({ company }: { company: CompanyRow }) {
  if (company.website_class === null || company.commercial_score === null) {
    return (
      <EmptyState
        variant="inline"
        title="Ainda não classificada"
        description="A classificação comercial aparece após o processamento da empresa."
      />
    );
  }

  const priority = WEBSITE_CLASS_TO_PRIORITY[company.website_class];
  const origin =
    company.commercial_scored_by === "prefilter"
      ? "Pré-filtro (sem IA)"
      : company.commercial_scored_by === "ai"
        ? "Análise por IA"
        : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-micro text-text-muted">Score comercial</p>
          <p className="text-display tabular-nums text-text-primary">
            {company.commercial_score}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={commercialPriorityVariant[priority]}>
            {commercialPriorityLabel[priority]}
          </Badge>
          <span className="text-micro text-text-muted">
            {websiteClassLabel[company.website_class]}
          </span>
        </div>
      </div>

      {company.commercial_factors.length > 0 ? (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <p className="text-micro text-text-muted">Motivos</p>
          <ul className="space-y-1.5">
            {company.commercial_factors.map((factor, index) => (
              <li
                key={`${factor.code}-${index}`}
                className="flex items-start gap-2 text-meta text-text-secondary"
              >
                <span
                  aria-hidden
                  className={`mt-px font-mono ${effectClass[factor.effect]}`}
                >
                  {factor.effect}
                </span>
                <span className="min-w-0">{factor.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {origin ? (
        <p className="text-micro text-text-muted">Origem: {origin}</p>
      ) : null}
    </div>
  );
}
