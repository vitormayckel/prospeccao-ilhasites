import { createHash } from "node:crypto";
import type {
  PlacesProvider,
  ProviderResult,
  ProviderSearchOutcome,
  ProviderSearchQuery,
} from "@/server/providers/places/types";

// =====================================================================
// Provedor FIXTURE — determinístico e SEM custo (estimatedCost = 0).
// Gera negócios locais plausíveis por (categoria × cidade) para exercitar
// todo o pipeline de coleta/normalização/dedup sem depender de API paga.
// Determinístico: a mesma consulta sempre retorna os mesmos resultados,
// então re-execuções são naturalmente idempotentes (o dedup casa tudo).
// =====================================================================

/** DDDs por cidade conhecida; usado para gerar telefones plausíveis. */
const CITY_DDD: Record<string, string> = {
  vitoria: "27",
  "vila velha": "27",
  serra: "27",
  cariacica: "27",
  "sao paulo": "11",
  campinas: "19",
  "rio de janeiro": "21",
  "belo horizonte": "31",
  curitiba: "41",
};

const STREET_NAMES = [
  "Rua das Palmeiras",
  "Avenida Central",
  "Rua Sete de Setembro",
  "Avenida Beira Mar",
  "Rua do Comercio",
  "Avenida Jeronimo Monteiro",
  "Rua Coronel Schwab",
  "Travessa Santa Luzia",
];

const NAME_SUFFIXES = [
  "Center",
  "Prime",
  "Express",
  "Premium",
  "E Associados",
  "do Bairro",
  "Consultoria",
  "Solucoes",
];

function seededInt(seed: string, max: number): number {
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % max;
}

function slugCity(city: string): string {
  return city.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function titleCaseCategory(category: string): string {
  return category
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Quantos resultados o fixture "encontra" para uma consulta (estável). */
function resultCountFor(query: ProviderSearchQuery): number {
  const base = 6 + seededInt(`${query.category}|${query.city}`, 7); // 6..12
  return Math.min(base, query.limit);
}

function buildResult(
  query: ProviderSearchQuery,
  index: number,
): ProviderResult {
  const key = `fixture|${query.category}|${query.city}|${index}`;
  const citySlug = slugCity(query.city);
  const ddd = CITY_DDD[citySlug] ?? "27";

  const catTitle = titleCaseCategory(query.category);
  const suffix =
    NAME_SUFFIXES[seededInt(`${key}|suffix`, NAME_SUFFIXES.length)]!;
  const name = `${catTitle} ${suffix} ${index + 1}`;

  // Telefone celular BR: DDD + 9 + 8 dígitos.
  const subscriber = (10000000 + seededInt(`${key}|phone`, 89999999))
    .toString()
    .padStart(8, "0");
  const phone = `(${ddd}) 9${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  // ~40% dos negócios já têm site (não são alvo); 60% sem site (alvo Ilha Sites).
  const hasWebsite = seededInt(`${key}|site`, 10) < 4;
  const domainSlug = `${citySlug.replace(/\s+/g, "")}${index}${seededInt(`${key}|dom`, 1000)}`;
  const website = hasWebsite ? `https://www.${domainSlug}.com.br` : null;

  const hasInstagram = seededInt(`${key}|ig`, 10) < 7;
  const instagram = hasInstagram ? `https://instagram.com/${domainSlug}` : null;

  const street = STREET_NAMES[seededInt(`${key}|street`, STREET_NAMES.length)]!;
  const number = 50 + seededInt(`${key}|num`, 1900);
  const addressLine = `${street}, ${number}`;

  const rating = 3 + seededInt(`${key}|rating`, 21) / 10; // 3.0..5.0
  const reviewsCount = seededInt(`${key}|reviews`, 400);

  const externalId = `fixture:${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;

  return {
    externalId,
    name,
    primaryCategory: catTitle,
    phone,
    website,
    instagram,
    addressLine,
    city: query.city,
    state: query.state,
    postalCode: `29${(100 + seededInt(`${key}|cep`, 899)).toString()}-000`,
    countryCode: query.countryCode,
    latitude: -20.3 + seededInt(`${key}|lat`, 1000) / 10000,
    longitude: -40.3 + seededInt(`${key}|lng`, 1000) / 10000,
    rating: Math.round(rating * 10) / 10,
    reviewsCount,
    sourceUrl: `https://maps.google.com/?q=${encodeURIComponent(`${name} ${query.city}`)}`,
    rawPayload: {
      provider: "fixture",
      query: { category: query.category, city: query.city, state: query.state },
      generatedFrom: key,
    },
  };
}

/** Cria o provedor fixture (sem custo). */
export function createFixturePlacesProvider(): PlacesProvider {
  return {
    name: "fixture",
    async search(query: ProviderSearchQuery): Promise<ProviderSearchOutcome> {
      const count = resultCountFor(query);
      const results: ProviderResult[] = [];
      for (let i = 0; i < count; i++) {
        const result = buildResult(query, i);
        if (query.minRating != null && (result.rating ?? 0) < query.minRating) {
          continue;
        }
        results.push(result);
      }
      return { results, estimatedCost: 0 };
    },
  };
}
