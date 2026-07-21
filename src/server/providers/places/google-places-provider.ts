import "server-only";
import { normalizeUf } from "@/server/services/normalization";
import type {
  PlacesProvider,
  ProviderResult,
  ProviderSearchOutcome,
  ProviderSearchQuery,
} from "@/server/providers/places/types";

// =====================================================================
// Provedor Google Places API (New) — Text Search.
// Doc: https://developers.google.com/maps/documentation/places/web-service/text-search
// Retorna telefone, site (campo-chave p/ identificar quem NÃO tem website),
// endereço, nota e avaliações. Exige GOOGLE_PLACES_API_KEY + billing ativo.
// =====================================================================

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** Campos solicitados (FieldMask). Inclui telefone/site (SKU Pro/Enterprise). */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryTypeDisplayName",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
].join(",");

/** Máximo por página aceito pela API (proteção de custo/paginação — RN-10). */
const MAX_PAGE_SIZE = 20;

/** Custo estimado por requisição (US$). Ajustável via env conforme o SKU. */
function costPerRequest(): number {
  const raw = Number(process.env.GOOGLE_PLACES_COST_PER_REQUEST);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.032;
}

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
}

interface GoogleTextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

function componentByType(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): string | null {
  const match = components?.find((c) => c.types?.includes(type));
  return match?.longText ?? match?.shortText ?? null;
}

/**
 * Versão que prefere a forma CURTA do componente.
 *
 * Necessária para a UF: `longText` devolve "Espírito Santo" e o sistema
 * inteiro trabalha com a sigla de 2 letras ("ES"). Sem isto, cada coleta
 * regravava o nome por extenso e quebrava a deduplicação por cidade+UF.
 */
function componentShortByType(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): string | null {
  const match = components?.find((c) => c.types?.includes(type));
  return match?.shortText ?? match?.longText ?? null;
}

function mapPlace(
  place: GooglePlace,
  query: ProviderSearchQuery,
): ProviderResult {
  const components = place.addressComponents;
  const city =
    componentByType(components, "locality") ??
    componentByType(components, "administrative_area_level_2") ??
    query.city;
  // Sempre a sigla: "ES", nunca "Espírito Santo".
  const state = normalizeUf(
    componentShortByType(components, "administrative_area_level_1") ??
      query.state,
  );

  return {
    externalId: place.id ?? null,
    name: place.displayName?.text ?? "(sem nome)",
    primaryCategory: place.primaryTypeDisplayName?.text ?? query.category,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    instagram: null,
    addressLine: place.formattedAddress ?? null,
    city,
    state,
    postalCode: componentByType(components, "postal_code"),
    countryCode:
      componentByType(components, "country") ?? query.countryCode ?? "BR",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    reviewsCount: place.userRatingCount ?? null,
    sourceUrl: place.googleMapsUri ?? null,
    rawPayload: place as unknown as Record<string, unknown>,
  };
}

/** Cria o provedor Google Places. `apiKey` já validado como presente. */
export function createGooglePlacesProvider(apiKey: string): PlacesProvider {
  return {
    name: "google_places",
    async search(query: ProviderSearchQuery): Promise<ProviderSearchOutcome> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const body: Record<string, unknown> = {
          // Cidade, UF e país explícitos. Sem a UF, "Betim" podia cair no
          // estado errado; sem o país, o Google pode resolver homônimos fora
          // do Brasil. Ambos são obrigatórios na consulta.
          textQuery: `${query.category} em ${query.city}, ${query.state}, Brasil`,
          regionCode: query.countryCode || "BR",
          languageCode: "pt-BR",
          maxResultCount: Math.min(query.limit, MAX_PAGE_SIZE),
        };
        if (query.minRating != null) body.minRating = query.minRating;

        const response = await fetch(TEXT_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const detail = await safeErrorMessage(response);
          throw new Error(
            `Google Places retornou ${response.status}: ${detail}`,
          );
        }

        const data = (await response.json()) as GoogleTextSearchResponse;
        const results = (data.places ?? []).map((p) => mapPlace(p, query));
        return { results, estimatedCost: costPerRequest() };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Google Places excedeu o tempo limite (15s).");
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** Extrai a mensagem de erro da API sem vazar o corpo bruto inteiro. */
async function safeErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    return data.error?.message ?? data.error?.status ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
