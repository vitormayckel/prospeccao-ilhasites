// =====================================================================
// Factories tipadas — constroem entidades válidas com defaults + overrides.
// Úteis para testes e geração de dados. Determinísticas por contador.
// =====================================================================

import type { InsertDto } from "@/types/database";
import type { ProspectAnalysis } from "@/types/domain";
import type { SearchProfileInput } from "@/lib/validation/search-profile";
import type { TemplateInput } from "@/lib/validation/template";

let counter = 0;
const next = () => ++counter;

/** Reinicia o contador (útil entre testes). */
export function resetFactoryCounter(): void {
  counter = 0;
}

export function makeCompany(
  overrides: Partial<InsertDto<"companies">> = {},
): InsertDto<"companies"> {
  const n = next();
  const name = overrides.name ?? `Empresa Teste ${n}`;
  const normalized =
    overrides.normalized_name ??
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return {
    name,
    normalized_name: normalized,
    primary_category: "Serviços",
    city: "Vitória",
    state: "ES",
    country_code: "BR",
    whatsapp_status: "unknown",
    pipeline_stage: "new",
    review_status: "pending_analysis",
    priority: "normal",
    ...overrides,
  };
}

export function makeAnalysisOutput(
  overrides: Partial<ProspectAnalysis> = {},
): ProspectAnalysis {
  const score = overrides.score ?? 70;
  return {
    version: "1.0",
    recommendation: score >= 65 ? "prioritize" : "review",
    score,
    potential: "high",
    confidence: "medium",
    commercial_score: score,
    website_assessment: {
      class: "reasonable",
      reasons: ["Classificação de teste."],
    },
    commercial_factors: [
      { code: "site_quality", label: "Site razoável (teste)", effect: "=" },
    ],
    executive_summary: "Resumo executivo de teste.",
    score_breakdown: [
      {
        dimension: "Lacuna de presença digital",
        points: 24,
        max_points: 30,
        explanation: "Site não localizado.",
        evidence_refs: ["source:google_places"],
      },
    ],
    positives: [{ text: "Boa reputação.", evidence_refs: ["field:rating"] }],
    risks: [],
    opportunities: [
      {
        text: "Criar site institucional.",
        evidence_refs: ["field:website_url"],
      },
    ],
    sales_arguments: [
      { text: "Site premium para captar clientes.", evidence_refs: [] },
    ],
    missing_data: [],
    cautions: ["Score é recomendação, não decisão."],
    ...overrides,
  };
}

export function makeSearchProfileInput(
  overrides: Partial<SearchProfileInput> = {},
): SearchProfileInput {
  const n = next();
  return {
    name: `Perfil ${n}`,
    status: "active",
    weekdays: [1, 2, 3, 4, 5],
    runTime: "07:00",
    timezone: "America/Sao_Paulo",
    dailyLimit: 50,
    locations: [{ city: "Vitória", state: "ES", countryCode: "BR" }],
    categories: [{ label: "Contabilidade" }],
    ...overrides,
  };
}

export function makeTemplateInput(
  overrides: Partial<TemplateInput> = {},
): TemplateInput {
  const n = next();
  return {
    name: `Template ${n}`,
    category: "first_contact",
    content: "Olá, {{company_name}}!",
    allowedVariables: ["company_name"],
    isDefault: false,
    active: true,
    ...overrides,
  };
}
