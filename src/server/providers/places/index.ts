import {
  type PlacesProvider,
  ProviderNotConfiguredError,
} from "@/server/providers/places/types";
import { createFixturePlacesProvider } from "@/server/providers/places/fixture-provider";
import { createGooglePlacesProvider } from "@/server/providers/places/google-places-provider";

export * from "@/server/providers/places/types";

/**
 * Registro de provedores de coleta. Casado com `search_profiles.provider`.
 *
 * - `fixture`: determinístico e sem custo — usado em dev e como fallback.
 * - `google_places`: integração real (Places API New). Habilitada quando
 *   GOOGLE_PLACES_API_KEY está definido; caso contrário lança
 *   ProviderNotConfiguredError com mensagem acionável (RF-10 / §10.5).
 */
export function getPlacesProvider(providerName: string): PlacesProvider {
  switch (providerName) {
    case "fixture":
      return createFixturePlacesProvider();
    case "google_places": {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) throw new ProviderNotConfiguredError("google_places");
      return createGooglePlacesProvider(apiKey);
    }
    default:
      throw new ProviderNotConfiguredError(providerName);
  }
}

/**
 * Resolve o provedor efetivo para uma execução. Enquanto nenhuma integração
 * paga estiver habilitada, `google_places` cai para o fixture apenas quando
 * explicitamente permitido via env (COLLECTION_ALLOW_FIXTURE_FALLBACK).
 */
export function resolveProviderForRun(providerName: string): PlacesProvider {
  if (
    providerName !== "fixture" &&
    process.env.COLLECTION_ALLOW_FIXTURE_FALLBACK === "true"
  ) {
    return createFixturePlacesProvider();
  }
  return getPlacesProvider(providerName);
}
