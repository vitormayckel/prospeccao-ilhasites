// =====================================================================
// Contrato provider-agnóstico de coleta de negócios locais (Blueprint RF-04).
// Qualquer provedor (Google Places, OpenStreetMap, fixture, etc.) implementa
// esta interface. O pipeline de coleta não conhece o provedor concreto.
// =====================================================================

/** Consulta de coleta para um par (categoria × localidade). */
export interface ProviderSearchQuery {
  category: string;
  /** Termo de categoria específico do provedor, quando houver. */
  providerCategory?: string | null;
  city: string;
  state: string;
  countryCode: string;
  radiusMeters?: number | null;
  minRating?: number | null;
  /** Teto de resultados a puxar nesta consulta (proteção de custo/paginação). */
  limit: number;
  /**
   * Token opaco da próxima página, devolvido por uma consulta anterior.
   * Ausente = primeira página. Provedores sem paginação ignoram.
   */
  pageToken?: string | null;
}

/**
 * Resultado bruto de um provedor — campos crus, ainda NÃO normalizados.
 * A normalização (RF-05) e a deduplicação (RF-06) acontecem no pipeline.
 */
export interface ProviderResult {
  externalId: string | null;
  name: string;
  primaryCategory: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewsCount: number | null;
  sourceUrl: string | null;
  /** Payload bruto controlado, persistido em company_sources.raw_payload. */
  rawPayload: Record<string, unknown>;
}

/** Retorno de uma consulta: resultados + custo estimado incorrido. */
export interface ProviderSearchOutcome {
  results: ProviderResult[];
  /** Custo estimado desta consulta (0 para provedores sem cobrança). */
  estimatedCost: number;
  /**
   * Token da próxima página, quando o provedor indica que há mais resultados.
   * `null`/ausente significa que esta combinação se esgotou.
   */
  nextPageToken?: string | null;
}

/** Provedor de coleta de negócios locais. */
export interface PlacesProvider {
  /** Identificador estável, casado com `search_profiles.provider`. */
  readonly name: string;
  /** Executa uma consulta e devolve resultados brutos + custo estimado. */
  search(query: ProviderSearchQuery): Promise<ProviderSearchOutcome>;
}

/** Lançado quando um provedor existe mas não está configurado/habilitado. */
export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(
      `Provedor "${providerName}" não está configurado. ` +
        `Defina as credenciais e habilite a integração antes de executar a coleta.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}
