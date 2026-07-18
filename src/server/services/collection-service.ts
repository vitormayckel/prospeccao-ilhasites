import "server-only";
import type { SearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
import type {
  CollectionRepository,
  NormalizedCandidate,
} from "@/server/repositories/collection-repository";
import type {
  CompanyRow,
  SearchRunRow,
  SearchRunTrigger,
} from "@/types/domain";
import type {
  ProviderResult,
  ProviderSearchQuery,
} from "@/server/providers/places";
import { resolveProviderForRun } from "@/server/providers/places";
import {
  normalizeName,
  normalizeCity,
  normalizePhoneE164,
  normalizeDomain,
  normalizeUrl,
  normalizeAddress,
} from "@/server/services/normalization";

/** Teto de resultados por consulta (categoria×cidade) — proteção de paginação. */
const PER_QUERY_CAP = 20;

export interface RunSearchInput {
  profileId: string;
  trigger: SearchRunTrigger;
  /** Chave de idempotência explícita; se ausente, é derivada do gatilho. */
  idempotencyKey?: string;
  /** Não persiste nada — apenas simula ("Testar configuração", RF §12.6). */
  dryRun?: boolean;
}

export interface RunSearchResult {
  run: SearchRunRow | null;
  status: SearchRunRow["status"];
  /** Teto de novos candidatos pedido para a execução (RN-10 = daily_limit). */
  requested: number;
  resultsSeen: number;
  newCompanies: number;
  duplicates: number;
  suppressed: number;
  failedItems: number;
  /** Importadas sem telefone — flag de contatabilidade, não descarte. */
  noPhone: number;
  estimatedCost: number;
  reusedExistingRun: boolean;
  error?: string;
}

function candidateFrom(
  provider: string,
  result: ProviderResult,
): NormalizedCandidate {
  return {
    provider,
    externalId: result.externalId,
    name: result.name,
    normalizedName: normalizeName(result.name),
    primaryCategory: result.primaryCategory,
    phoneRaw: result.phone,
    phoneE164: normalizePhoneE164(result.phone),
    websiteUrl: normalizeUrl(result.website),
    normalizedDomain: normalizeDomain(result.website),
    instagramUrl: normalizeUrl(result.instagram),
    addressLine: result.addressLine,
    normalizedAddress: normalizeAddress(result.addressLine),
    city: result.city,
    normalizedCity: normalizeCity(result.city),
    state: result.state,
    postalCode: result.postalCode,
    countryCode: result.countryCode,
    latitude: result.latitude,
    longitude: result.longitude,
    rating: result.rating,
    reviewsCount: result.reviewsCount,
    sourceUrl: result.sourceUrl,
    rawPayload: result.rawPayload,
  };
}

function deriveIdempotencyKey(input: RunSearchInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  if (input.trigger === "scheduled") {
    const day = new Date().toISOString().slice(0, 10);
    return `sched:${input.profileId}:${day}`;
  }
  return `manual:${input.profileId}:${Date.now()}`;
}

export function createCollectionService(deps: {
  searchProfiles: SearchProfilesRepository;
  collection: CollectionRepository;
}) {
  const { searchProfiles, collection } = deps;

  async function runSearch(input: RunSearchInput): Promise<RunSearchResult> {
    const detail = await searchProfiles.getDetail(input.profileId);
    if (!detail) {
      return {
        run: null,
        status: "failed",
        requested: 0,
        resultsSeen: 0,
        newCompanies: 0,
        duplicates: 0,
        suppressed: 0,
        failedItems: 0,
        noPhone: 0,
        estimatedCost: 0,
        reusedExistingRun: false,
        error: "Perfil de pesquisa não encontrado.",
      };
    }
    const { profile, locations, categories } = detail;
    const activeCategories = categories.filter((c) => c.active);

    const key = deriveIdempotencyKey(input);

    // Idempotência (RF-03): execução concluída com a mesma chave não repete.
    if (!input.dryRun) {
      const existing = await collection.findRunByIdempotencyKey(key);
      if (
        existing &&
        (existing.status === "completed" || existing.status === "partial")
      ) {
        return {
          run: existing,
          status: existing.status,
          requested: profile.daily_limit,
          resultsSeen: existing.results_seen,
          newCompanies: existing.new_companies,
          duplicates: existing.duplicates,
          suppressed: 0,
          failedItems: existing.failed_items,
          noPhone: 0,
          estimatedCost: existing.estimated_cost,
          reusedExistingRun: true,
        };
      }
    }

    const run = input.dryRun
      ? null
      : await collection.createRun({
          profileId: profile.id,
          idempotencyKey: key,
          trigger: input.trigger,
        });

    let resultsSeen = 0;
    let newCompanies = 0;
    let duplicates = 0;
    let suppressed = 0;
    let failedItems = 0;
    let noPhone = 0;
    let estimatedCost = 0;

    try {
      const provider = resolveProviderForRun(profile.provider);

      outer: for (const location of locations) {
        for (const category of activeCategories) {
          const remaining = profile.daily_limit - newCompanies;
          if (remaining <= 0) break outer; // RN-10: teto de novos candidatos.

          const query: ProviderSearchQuery = {
            category: category.label,
            providerCategory: category.provider_category,
            city: location.city,
            state: location.state,
            countryCode: location.country_code,
            radiusMeters: profile.radius_meters,
            minRating: profile.min_rating,
            limit: Math.min(remaining, PER_QUERY_CAP),
          };

          const outcome = await provider.search(query);
          estimatedCost += outcome.estimatedCost;

          for (const result of outcome.results) {
            resultsSeen++;
            if (profile.daily_limit - newCompanies <= 0) break outer;

            try {
              const candidate = candidateFrom(profile.provider, result);

              if (
                await collection.isSuppressed({
                  phoneE164: candidate.phoneE164,
                  normalizedDomain: candidate.normalizedDomain,
                })
              ) {
                suppressed++;
                continue;
              }

              const outcome2 = await classifyAndPersist(
                candidate,
                run?.id,
                input.dryRun,
              );
              if (outcome2 === "new") {
                newCompanies++;
                // Observacional: importada mas sem telefone (não contactável
                // por WhatsApp). Não altera o que é importado.
                if (!candidate.phoneE164 && !candidate.phoneRaw) noPhone++;
              } else duplicates++;
            } catch {
              failedItems++;
            }
          }
        }
      }

      const status: SearchRunRow["status"] =
        failedItems > 0 ? "partial" : "completed";

      if (run && !input.dryRun) {
        const finished = await collection.finishRun(run.id, {
          status,
          resultsSeen,
          newCompanies,
          duplicates,
          failedItems,
          estimatedCost,
        });
        await searchProfiles.markRan(profile.id);
        return {
          run: finished,
          status,
          requested: profile.daily_limit,
          resultsSeen,
          newCompanies,
          duplicates,
          suppressed,
          failedItems,
          noPhone,
          estimatedCost,
          reusedExistingRun: false,
        };
      }

      return {
        run: null,
        status,
        requested: profile.daily_limit,
        resultsSeen,
        newCompanies,
        duplicates,
        suppressed,
        failedItems,
        noPhone,
        estimatedCost,
        reusedExistingRun: false,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha desconhecida na coleta.";
      if (run && !input.dryRun) {
        await collection.finishRun(run.id, {
          status: "failed",
          resultsSeen,
          newCompanies,
          duplicates,
          failedItems,
          estimatedCost,
          errorCode: "provider_error",
          errorMessage: message,
        });
      }
      return {
        run,
        status: "failed",
        requested: profile.daily_limit,
        resultsSeen,
        newCompanies,
        duplicates,
        suppressed,
        failedItems,
        noPhone,
        estimatedCost,
        reusedExistingRun: false,
        error: message,
      };
    }
  }

  /** Decide dedup (RF-06) e persiste. Retorna "new" ou "duplicate". */
  async function classifyAndPersist(
    candidate: NormalizedCandidate,
    runId: string | undefined,
    dryRun?: boolean,
  ): Promise<"new" | "duplicate"> {
    // Níveis 1–3: match exato → mescla na existente (preserva proveniência).
    let exact: CompanyRow | null = null;
    if (candidate.externalId) {
      exact = await collection.findByProviderExternalId(
        candidate.provider,
        candidate.externalId,
      );
    }
    if (!exact && candidate.phoneE164) {
      exact = await collection.findByPhone(candidate.phoneE164);
    }
    if (!exact && candidate.normalizedDomain) {
      exact = await collection.findByDomain(candidate.normalizedDomain);
    }

    if (exact) {
      if (!dryRun) {
        const source = await collection.upsertSource(exact.id, candidate);
        await collection.fillMissingCompanyFields(exact.id, candidate);
        await collection.insertFieldEvidence(
          exact.id,
          source.id,
          evidenceOf(candidate),
        );
      }
      return "duplicate";
    }

    // Nível 4: nome semelhante na mesma cidade → INCERTO (novo + sinalizado).
    const similar = await collection.findSimilarByName(
      candidate.normalizedName,
      candidate.city,
    );

    if (dryRun || !runId) return "new";

    const company = await collection.insertCompany(candidate, runId);
    const source = await collection.upsertSource(company.id, candidate);
    await collection.insertFieldEvidence(
      company.id,
      source.id,
      evidenceOf(candidate),
    );
    if (similar) {
      await collection.addUncertainDuplicateNote(company.id, {
        id: similar.company.id,
        name: similar.company.name,
        similarity: similar.similarity,
      });
    }
    return "new";
  }

  function evidenceOf(
    candidate: NormalizedCandidate,
  ): { field: string; value: string | null }[] {
    return [
      { field: "name", value: candidate.name },
      { field: "phone", value: candidate.phoneE164 },
      { field: "website", value: candidate.websiteUrl },
      { field: "instagram", value: candidate.instagramUrl },
      { field: "address", value: candidate.addressLine },
    ];
  }

  return { runSearch };
}

export type CollectionService = ReturnType<typeof createCollectionService>;
