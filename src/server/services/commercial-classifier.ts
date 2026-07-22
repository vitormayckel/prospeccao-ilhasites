import "server-only";
import type {
  CompanyRow,
  CommercialFactor,
  CommercialPriority,
  WebsiteClass,
} from "@/types/domain";
import { WEBSITE_CLASS_TO_PRIORITY } from "@/types/domain";

// =====================================================================
// Classificação comercial — módulo PURO (sem I/O, sem rede), testável.
//
// Duas responsabilidades:
//  1. Pré-filtro determinístico das empresas SEM domínio próprio (Prioridade
//     A): elas não vão à IA. Aqui calculamos website_class='none', o
//     commercial_score e os fatores explicativos a partir dos sinais que já
//     temos na coleta (Google Places).
//  2. Fator de competitividade do mercado local (market_competitiveness),
//     aplicado de forma UNIFORME às empresas A (aqui) e às B/C/D (no service,
//     sobre o score que a IA devolveu). Uma única fonte de verdade do bônus.
//
// A rubrica (pesos) fica concentrada em RUBRIC — versionada e fácil de ajustar.
// Alterar a rubrica é o vetor de evolução previsto; nada mais precisa mudar.
// =====================================================================

/** Versão da rubrica determinística — auditoria e futura recalibração. */
export const RUBRIC_VERSION = "2026-07-22.1";

/** Pesos do score determinístico (empresas sem site). Soma máx. ~100. */
const RUBRIC = {
  /** Ausência de site próprio é o sinal-âncora da oferta da Ilha Sites. */
  noSiteBase: 45,
  /** Instagram ativo sem site: audiência a converter em presença própria. */
  instagram: 8,
  reviews: { high: 15, mid: 10, low: 5, thresholds: { high: 100, mid: 20 } },
  rating: { great: 10, good: 7, ok: 4, poor: 2, thresholds: { great: 4.5, good: 4, ok: 3.5 } },
  whatsapp: 8,
  phone: 5,
  category: 5,
} as const;

/** Bônus máximo de competitividade de mercado, por classe de site. */
const MARKET_BONUS_MAX: Record<WebsiteClass, number> = {
  none: 12, // sem site em mercado digitalizado → urgência máxima
  very_poor: 8, // site fraco → ainda atrás dos concorrentes
  reasonable: 3, // já compete de forma razoável
  professional: 0, // não é urgência comercial
};

/** Amostra mínima de concorrentes para o mercado ser considerado confiável. */
const MARKET_MIN_SAMPLE = 8;

export interface MarketCompetitiveness {
  /** Fração de concorrentes do mesmo mercado com domínio próprio (0–1). */
  share: number;
  /** Nº de concorrentes conhecidos no mercado (cidade × categoria). */
  sampleSize: number;
  /** true quando há amostra suficiente para o fator ter peso pleno. */
  sufficient: boolean;
}

/** Mercado neutro (usado quando cidade/categoria são desconhecidas). */
export const NEUTRAL_MARKET: MarketCompetitiveness = {
  share: 0,
  sampleSize: 0,
  sufficient: false,
};

/**
 * Constrói a métrica de competitividade a partir das contagens brutas do
 * repositório. O limiar de amostra vive só aqui (fonte única).
 */
export function buildMarket(total: number, withSite: number): MarketCompetitiveness {
  const sampleSize = Math.max(0, total);
  return {
    share: sampleSize > 0 ? Math.max(0, Math.min(1, withSite / sampleSize)) : 0,
    sampleSize,
    sufficient: sampleSize >= MARKET_MIN_SAMPLE,
  };
}

const clamp0100 = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(n)));

/** Empresa tem site PRÓPRIO? (rede social já vem com normalized_domain nulo.) */
export function hasOwnDomain(company: Pick<CompanyRow, "normalized_domain">): boolean {
  return Boolean(company.normalized_domain);
}

/** Prioridade comercial (A/B/C/D) a partir da classe do site. */
export function priorityFromClass(cls: WebsiteClass): CommercialPriority {
  return WEBSITE_CLASS_TO_PRIORITY[cls];
}

/**
 * Fator + bônus de competitividade de mercado. Aplicado igual para A (regra) e
 * B/C/D (sobre o score da IA), garantindo consistência e auditabilidade.
 * Mercado pouco digitalizado ou amostra insuficiente → peso menor/neutro.
 */
export function marketFactor(
  cls: WebsiteClass,
  market: MarketCompetitiveness,
): { bonus: number; factor: CommercialFactor } {
  const cap = MARKET_BONUS_MAX[cls];
  const pct = Math.round(market.share * 100);

  if (!market.sufficient) {
    return {
      bonus: 0,
      factor: {
        code: "market_competitiveness",
        label:
          market.sampleSize > 0
            ? `Mercado local com amostra insuficiente (${market.sampleSize} concorrentes) — fator neutro`
            : "Mercado local ainda sem concorrentes conhecidos — fator neutro",
        effect: "=",
      },
    };
  }

  // Bônus proporcional à digitalização dos concorrentes. Cap por classe já
  // zera o efeito para sites profissionais (não é urgência).
  const bonus = Math.round(cap * market.share);
  return {
    bonus,
    factor: {
      code: "market_competitiveness",
      label:
        bonus > 0
          ? `Mercado local muito digitalizado (${pct}% dos concorrentes têm site) — maior urgência`
          : `Mercado local pouco digitalizado (${pct}% dos concorrentes têm site) — urgência menor`,
      effect: bonus > 0 ? "+" : "=",
    },
  };
}

export interface DeterministicResult {
  websiteClass: WebsiteClass; // sempre 'none' neste caminho
  commercialScore: number;
  factors: CommercialFactor[];
}

/**
 * Classifica e pontua uma empresa SEM domínio próprio (Prioridade A), sem IA.
 * Já incorpora o fator de competitividade de mercado.
 */
export function classifyWithoutSite(
  company: CompanyRow,
  market: MarketCompetitiveness,
): DeterministicResult {
  const factors: CommercialFactor[] = [];
  let score = 0;

  // Âncora: sem site próprio.
  score += RUBRIC.noSiteBase;
  const socialOnly = Boolean(company.instagram_url) || Boolean(company.website_url);
  factors.push({
    code: "no_own_site",
    label: socialOnly
      ? "Sem site próprio — apenas presença em redes/perfil externo"
      : "Sem site próprio localizado nas fontes consultadas",
    effect: "+",
  });

  // Instagram ativo (canal sem presença própria).
  if (company.instagram_url) {
    score += RUBRIC.instagram;
    factors.push({
      code: "instagram_no_site",
      label: "Instagram ativo sem site associado — audiência a converter",
      effect: "+",
    });
  }

  // Volume de avaliações → operação estabelecida.
  const reviews = company.reviews_count ?? 0;
  if (reviews > 0) {
    const pts =
      reviews >= RUBRIC.reviews.thresholds.high
        ? RUBRIC.reviews.high
        : reviews >= RUBRIC.reviews.thresholds.mid
          ? RUBRIC.reviews.mid
          : RUBRIC.reviews.low;
    score += pts;
    factors.push({
      code: "reviews",
      label: `${reviews} avaliações públicas — operação ${reviews >= RUBRIC.reviews.thresholds.mid ? "estabelecida" : "em formação"}`,
      effect: "+",
    });
  }

  // Nota pública.
  if (company.rating != null) {
    const r = company.rating;
    const pts =
      r >= RUBRIC.rating.thresholds.great
        ? RUBRIC.rating.great
        : r >= RUBRIC.rating.thresholds.good
          ? RUBRIC.rating.good
          : r >= RUBRIC.rating.thresholds.ok
            ? RUBRIC.rating.ok
            : RUBRIC.rating.poor;
    score += pts;
    factors.push({
      code: "rating",
      label: `Nota ${r} no Google`,
      effect: r >= RUBRIC.rating.thresholds.ok ? "+" : "-",
    });
  }

  // Contatabilidade.
  const whatsappProbable =
    company.whatsapp_status === "probable" ||
    company.whatsapp_status === "confirmed";
  if (whatsappProbable) {
    score += RUBRIC.whatsapp;
    factors.push({
      code: "whatsapp",
      label: "WhatsApp provável — abordagem direta possível",
      effect: "+",
    });
  }
  if (company.phone_e164 || company.phone_raw) {
    score += RUBRIC.phone;
    factors.push({
      code: "phone",
      label: "Telefone disponível",
      effect: "+",
    });
  }

  // Categoria conhecida (aderência da oferta).
  if (company.primary_category) {
    score += RUBRIC.category;
    factors.push({
      code: "category",
      label: `Categoria definida: ${company.primary_category}`,
      effect: "+",
    });
  }

  // Competitividade do mercado local (fator uniforme).
  const mf = marketFactor("none", market);
  score += mf.bonus;
  factors.push(mf.factor);

  return {
    websiteClass: "none",
    commercialScore: clamp0100(score),
    factors,
  };
}

/**
 * Motivos factuais da Prioridade A, prontos para exibição rápida. Derivados
 * apenas dos dados (sem juízo de valor) — complementam os factors do score.
 */
export function reasonsWithoutSite(company: CompanyRow): string[] {
  const reasons: string[] = [];
  if (!company.website_url && !company.instagram_url) {
    reasons.push("Sem site e sem redes localizados");
  } else {
    if (!company.website_url) reasons.push("Sem site próprio");
    if (company.instagram_url) reasons.push("Apenas Instagram");
  }
  reasons.push("Sem domínio próprio");
  if (company.rating == null && (company.reviews_count ?? 0) === 0) {
    reasons.push("Perfil público incompleto");
  }
  return reasons;
}
