import type { ProspectAnalysis, AiPotential } from "@/types/domain";
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
  CompanySnapshot,
} from "@/server/providers/analysis/types";

// =====================================================================
// Provedor de análise FIXTURE — determinístico e SEM custo.
// Aplica o modelo de score do Blueprint §9.2/§9.3 por heurística sobre o
// snapshot. Permite rodar todo o pipeline de IA (e validá-lo) sem API key.
// Não substitui a análise real; serve a dev, demonstração e testes.
// =====================================================================

function refFor(snapshot: CompanySnapshot, ref: string): string[] {
  return snapshot.evidence.some((e) => e.ref === ref) ? [ref] : [];
}

function potentialFor(score: number): AiPotential {
  if (score >= 80) return "very_high";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  if (score >= 25) return "low";
  return "very_low";
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function buildAnalysis(snapshot: CompanySnapshot): ProspectAnalysis {
  const f = snapshot.fields;
  const hasWebsite = f.has_website === true;
  const reviews = typeof f.reviews_count === "number" ? f.reviews_count : 0;
  const rating = typeof f.rating === "number" ? f.rating : null;
  const hasPhone = Boolean(f.phone);
  const whatsappProbable =
    f.whatsapp_status === "probable" || f.whatsapp_status === "confirmed";
  const hasInstagram = Boolean(f.instagram_url);
  const hasCategory = Boolean(f.primary_category);
  const hasAddress = Boolean(f.address);

  // §9.2 — pontuação por dimensão (peso máximo entre parênteses).
  const presenceGap = clamp(hasWebsite ? 8 : 30, 30);
  const commercial = clamp(
    (reviews > 100 ? 16 : reviews > 20 ? 12 : 8) + (hasCategory ? 4 : 0),
    20,
  );
  const reputation = clamp(
    rating == null
      ? 4
      : rating >= 4.5
        ? 15
        : rating >= 4
          ? 12
          : rating >= 3.5
            ? 9
            : 6,
    15,
  );
  const contact = clamp((hasPhone ? 10 : 0) + (whatsappProbable ? 5 : 0), 15);
  const communication = clamp(
    hasInstagram && !hasWebsite ? 10 : hasInstagram ? 6 : 3,
    10,
  );
  const presentFields = Object.values(f).filter(
    (v) => v != null && v !== false,
  ).length;
  const dataQuality = clamp((presentFields / Object.keys(f).length) * 10, 10);

  const breakdown = [
    {
      dimension: "Lacuna de presença digital",
      points: presenceGap,
      max_points: 30,
      explanation: hasWebsite
        ? "Website localizado; a lacuna de presença é menor."
        : "Nenhum website localizado nas fontes consultadas — forte lacuna de presença digital.",
      evidence_refs: refFor(snapshot, "field:website"),
    },
    {
      dimension: "Potencial comercial do negócio",
      points: commercial,
      max_points: 20,
      explanation: `Categoria ${hasCategory ? "definida" : "não informada"}; ${reviews} avaliações públicas indicam operação ${reviews > 20 ? "estabelecida" : "em formação"}.`,
      evidence_refs: [
        ...refFor(snapshot, "field:category"),
        ...refFor(snapshot, "field:rating"),
      ],
    },
    {
      dimension: "Confiança e reputação pública",
      points: reputation,
      max_points: 15,
      explanation:
        rating == null
          ? "Sem nota pública disponível."
          : `Nota ${rating} em avaliações públicas.`,
      evidence_refs: refFor(snapshot, "field:rating"),
    },
    {
      dimension: "Facilidade de contato",
      points: contact,
      max_points: 15,
      explanation: hasPhone
        ? `Telefone disponível${whatsappProbable ? "; WhatsApp provável (número celular)" : ""}.`
        : "Nenhum telefone localizado.",
      evidence_refs: [
        ...refFor(snapshot, "field:phone"),
        ...refFor(snapshot, "field:whatsapp"),
      ],
    },
    {
      dimension: "Oportunidade de comunicação",
      points: communication,
      max_points: 10,
      explanation:
        hasInstagram && !hasWebsite
          ? "Instagram presente sem website associado — canal ativo sem presença própria."
          : hasInstagram
            ? "Instagram presente."
            : "Poucos canais públicos localizados.",
      evidence_refs: refFor(snapshot, "field:instagram"),
    },
    {
      dimension: "Qualidade e completude dos dados",
      points: dataQuality,
      max_points: 10,
      explanation: `${presentFields} de ${Object.keys(f).length} campos preenchidos; ${hasAddress ? "endereço presente" : "endereço ausente"}.`,
      evidence_refs: refFor(snapshot, "field:address"),
    },
  ];

  const score = clamp(
    breakdown.reduce((sum, d) => sum + d.points, 0),
    100,
  );
  const potential = potentialFor(score);
  const recommendation =
    score >= 65 ? "prioritize" : score >= 45 ? "review" : "low_priority";
  const confidence =
    snapshot.missingFields.length <= 1
      ? "high"
      : snapshot.missingFields.length <= 3
        ? "medium"
        : "low";

  type Item = { text: string; evidence_refs: string[] };
  const positives: Item[] = [];
  if (!hasWebsite)
    positives.push({
      text: "Sem website próprio — aderente à oferta de site institucional da Ilha Sites.",
      evidence_refs: refFor(snapshot, "field:website"),
    });
  if (rating != null && rating >= 4)
    positives.push({
      text: `Boa reputação pública (nota ${rating}).`,
      evidence_refs: refFor(snapshot, "field:rating"),
    });
  if (hasPhone)
    positives.push({
      text: "Canal de contato direto disponível.",
      evidence_refs: refFor(snapshot, "field:phone"),
    });

  const risks: Item[] = [];
  if (hasWebsite)
    risks.push({
      text: "Já possui website — a proposta precisa de um diferencial claro.",
      evidence_refs: refFor(snapshot, "field:website"),
    });
  if (rating != null && rating < 3.5)
    risks.push({
      text: "Reputação pública baixa pode indicar operação instável.",
      evidence_refs: refFor(snapshot, "field:rating"),
    });

  const opportunities: Item[] = [];
  if (!hasWebsite)
    opportunities.push({
      text: "Oferecer presença digital própria (site institucional premium).",
      evidence_refs: refFor(snapshot, "field:website"),
    });
  if (hasInstagram && !hasWebsite)
    opportunities.push({
      text: "Converter a audiência do Instagram em um site que centralize contato e credibilidade.",
      evidence_refs: refFor(snapshot, "field:instagram"),
    });

  const sales_arguments: Item[] = [];
  if (!hasWebsite)
    sales_arguments.push({
      text: "Um site próprio aumenta a confiança e captura clientes que hoje buscam no Google.",
      evidence_refs: refFor(snapshot, "field:website"),
    });
  if (whatsappProbable)
    sales_arguments.push({
      text: "Integrar o site ao WhatsApp encurta o caminho até o atendimento.",
      evidence_refs: refFor(snapshot, "field:whatsapp"),
    });

  // Classificação do website (fixture: heurística simples; a empresa tem site).
  // Sem fetch real, aproxima pela reputação/completude — nunca "profissional"
  // por padrão, para não auto-despriorizar sem evidência.
  const websiteClass: "very_poor" | "reasonable" | "professional" =
    rating != null && rating >= 4.5 && reviews > 100 ? "professional" : "reasonable";
  const commercial_factors = [
    {
      code: "site_quality",
      label:
        websiteClass === "professional"
          ? "Site aparenta boa maturidade (heurística)"
          : "Site presente, qualidade a confirmar (heurística)",
      effect: (websiteClass === "professional" ? "-" : "=") as "+" | "-" | "=",
    },
    {
      code: "reviews",
      label: `${reviews} avaliações públicas`,
      effect: (reviews > 20 ? "+" : "=") as "+" | "-" | "=",
    },
    {
      code: "whatsapp",
      label: whatsappProbable ? "WhatsApp provável" : "WhatsApp não verificado",
      effect: (whatsappProbable ? "+" : "=") as "+" | "-" | "=",
    },
  ];

  return {
    version: "1.0",
    recommendation,
    score,
    potential,
    confidence,
    // Score comercial (fixture): reaproveita a heurística do score analítico.
    commercial_score: score,
    website_assessment: {
      class: websiteClass,
      reasons: [
        "Classificação heurística (provedor fixture, sem verificação real do site)",
      ],
    },
    commercial_factors,
    executive_summary: hasWebsite
      ? `${f.name ?? "O negócio"} já tem presença digital; o fit depende de um diferencial claro. Score ${score}/100.`
      : `${f.name ?? "O negócio"} não tem website localizado e ${hasPhone ? "tem contato direto" : "precisa de contato"}. Boa aderência à oferta. Score ${score}/100.`,
    score_breakdown: breakdown,
    positives,
    risks,
    opportunities,
    sales_arguments,
    missing_data: snapshot.missingFields,
    cautions: [
      "Análise derivada apenas dos dados coletados; não infere faturamento, porte ou intenção de compra.",
      "Status de WhatsApp é probabilístico quando baseado apenas no tipo de número.",
    ],
  };
}

/** Cria o provedor de análise fixture (sem custo). */
export function createFixtureAnalysisProvider(): AnalysisProvider {
  return {
    name: "fixture",
    async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
      const started = Date.now();
      const analysis = buildAnalysis(request.snapshot);
      return {
        analysis,
        provider: "fixture",
        model: "fixture-heuristic-1",
        promptVersion: request.promptVersion,
        tokensInput: null,
        tokensOutput: null,
        costEstimate: 0,
        latencyMs: Date.now() - started,
      };
    },
  };
}
