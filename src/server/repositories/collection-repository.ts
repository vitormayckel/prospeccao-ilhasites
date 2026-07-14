import type { Db } from "@/lib/database/sql";
import type {
  CompanyRow,
  CompanySourceRow,
  SearchRunRow,
  SearchRunTrigger,
  SearchRunStatus,
} from "@/types/domain";

/** Candidato já normalizado, pronto para dedup/persistência. */
export interface NormalizedCandidate {
  provider: string;
  externalId: string | null;
  name: string;
  normalizedName: string;
  primaryCategory: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  instagramUrl: string | null;
  addressLine: string | null;
  normalizedAddress: string | null;
  city: string | null;
  normalizedCity: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewsCount: number | null;
  sourceUrl: string | null;
  rawPayload: Record<string, unknown>;
}

/** Limiar de similaridade (pg_trgm) para match incerto por nome. */
const NAME_SIMILARITY_THRESHOLD = 0.55;

export function createCollectionRepository(db: Db) {
  return {
    // ---- search_runs (idempotência — RF-03) -------------------------------
    async findRunByIdempotencyKey(key: string): Promise<SearchRunRow | null> {
      const rows = await db.query<SearchRunRow>(
        "select * from search_runs where idempotency_key = $1",
        [key],
      );
      return rows[0] ?? null;
    },

    async createRun(input: {
      profileId: string | null;
      idempotencyKey: string;
      trigger: SearchRunTrigger;
    }): Promise<SearchRunRow> {
      const rows = await db.query<SearchRunRow>(
        `insert into search_runs
           (search_profile_id, idempotency_key, trigger_type, status, started_at)
         values ($1, $2, $3, 'running', now())
         returning *`,
        [input.profileId, input.idempotencyKey, input.trigger],
      );
      return rows[0]!;
    },

    async finishRun(
      runId: string,
      input: {
        status: SearchRunStatus;
        resultsSeen: number;
        newCompanies: number;
        duplicates: number;
        failedItems: number;
        estimatedCost: number;
        errorCode?: string | null;
        errorMessage?: string | null;
      },
    ): Promise<SearchRunRow> {
      const rows = await db.query<SearchRunRow>(
        `update search_runs set
           status = $2,
           results_seen = $3,
           new_companies = $4,
           duplicates = $5,
           failed_items = $6,
           estimated_cost = $7,
           error_code = $8,
           error_message = $9,
           finished_at = now(),
           updated_at = now()
         where id = $1
         returning *`,
        [
          runId,
          input.status,
          input.resultsSeen,
          input.newCompanies,
          input.duplicates,
          input.failedItems,
          input.estimatedCost,
          input.errorCode ?? null,
          input.errorMessage ?? null,
        ],
      );
      return rows[0]!;
    },

    async listRunsByProfile(
      profileId: string,
      limit = 10,
    ): Promise<SearchRunRow[]> {
      return db.query<SearchRunRow>(
        `select * from search_runs
         where search_profile_id = $1
         order by created_at desc
         limit ${Number(limit)}`,
        [profileId],
      );
    },

    // ---- suppression (LGPD — Blueprint §5) --------------------------------
    async isSuppressed(input: {
      phoneE164: string | null;
      normalizedDomain: string | null;
    }): Promise<boolean> {
      if (!input.phoneE164 && !input.normalizedDomain) return false;
      const rows = await db.query<{ hit: number }>(
        `select 1 as hit from suppression_list
         where (phone_e164 is not null and phone_e164 = $1)
            or (normalized_domain is not null and normalized_domain = $2)
         limit 1`,
        [input.phoneE164, input.normalizedDomain],
      );
      return rows.length > 0;
    },

    // ---- deduplicação (RF-06, ordem de confiança) -------------------------
    /** Nível 1: mesmo provedor + identificador externo. */
    async findByProviderExternalId(
      provider: string,
      externalId: string,
    ): Promise<CompanyRow | null> {
      const rows = await db.query<CompanyRow>(
        `select c.* from companies c
         join company_sources s on s.company_id = c.id
         where s.provider = $1 and s.external_id = $2 and c.deleted_at is null
         limit 1`,
        [provider, externalId],
      );
      return rows[0] ?? null;
    },

    /** Nível 2: mesmo telefone normalizado. */
    async findByPhone(phoneE164: string): Promise<CompanyRow | null> {
      const rows = await db.query<CompanyRow>(
        "select * from companies where phone_e164 = $1 and deleted_at is null limit 1",
        [phoneE164],
      );
      return rows[0] ?? null;
    },

    /** Nível 3: mesmo domínio normalizado. */
    async findByDomain(normalizedDomain: string): Promise<CompanyRow | null> {
      const rows = await db.query<CompanyRow>(
        "select * from companies where normalized_domain = $1 and deleted_at is null limit 1",
        [normalizedDomain],
      );
      return rows[0] ?? null;
    },

    /** Nível 4: nome semelhante na mesma cidade (match INCERTO — sinalizar). */
    async findSimilarByName(
      normalizedName: string,
      city: string | null,
    ): Promise<{ company: CompanyRow; similarity: number } | null> {
      const rows = await db.query<CompanyRow & { similarity: number }>(
        `select c.*, similarity(c.normalized_name, $1) as similarity
         from companies c
         where c.deleted_at is null
           and ($2::text is null or lower(c.city) = lower($2))
           and similarity(c.normalized_name, $1) > $3
         order by similarity desc
         limit 1`,
        [normalizedName, city, NAME_SIMILARITY_THRESHOLD],
      );
      const row = rows[0];
      if (!row) return null;
      const { similarity, ...company } = row;
      return { company: company as CompanyRow, similarity };
    },

    // ---- persistência -----------------------------------------------------
    async insertCompany(
      candidate: NormalizedCandidate,
      sourceRunId: string,
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        `insert into companies (
           name, normalized_name, primary_category, phone_raw, phone_e164,
           website_url, normalized_domain, instagram_url, address_line,
           city, state, postal_code, country_code, latitude, longitude,
           rating, reviews_count, review_status, pipeline_stage, source_run_id
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           'pending_analysis','new',$18
         ) returning *`,
        [
          candidate.name,
          candidate.normalizedName,
          candidate.primaryCategory,
          candidate.phoneRaw,
          candidate.phoneE164,
          candidate.websiteUrl,
          candidate.normalizedDomain,
          candidate.instagramUrl,
          candidate.addressLine,
          candidate.city,
          candidate.state,
          candidate.postalCode,
          candidate.countryCode,
          candidate.latitude,
          candidate.longitude,
          candidate.rating,
          candidate.reviewsCount,
          sourceRunId,
        ],
      );
      return rows[0]!;
    },

    /**
     * Registra/atualiza a proveniência (RN-09). Se já existir a mesma fonte
     * (provider+external_id), apenas atualiza last_seen_at/payload; senão insere.
     */
    async upsertSource(
      companyId: string,
      candidate: NormalizedCandidate,
    ): Promise<CompanySourceRow> {
      if (candidate.externalId) {
        const existing = await db.query<CompanySourceRow>(
          `select * from company_sources
           where company_id = $1 and provider = $2 and external_id = $3 limit 1`,
          [companyId, candidate.provider, candidate.externalId],
        );
        if (existing[0]) {
          const rows = await db.query<CompanySourceRow>(
            `update company_sources
               set last_seen_at = now(), raw_payload = $2,
                   source_url = coalesce($3, source_url), updated_at = now()
             where id = $1 returning *`,
            [existing[0].id, candidate.rawPayload, candidate.sourceUrl],
          );
          return rows[0]!;
        }
      }
      const rows = await db.query<CompanySourceRow>(
        `insert into company_sources
           (company_id, provider, external_id, source_url, raw_payload)
         values ($1,$2,$3,$4,$5) returning *`,
        [
          companyId,
          candidate.provider,
          candidate.externalId,
          candidate.sourceUrl,
          candidate.rawPayload,
        ],
      );
      return rows[0]!;
    },

    /**
     * Preenche campos ausentes na empresa existente sem apagar dados (RN-09):
     * só grava onde o valor atual é nulo. Prefere preservar o já registrado.
     */
    async fillMissingCompanyFields(
      companyId: string,
      candidate: NormalizedCandidate,
    ): Promise<void> {
      await db.query(
        `update companies set
           primary_category = coalesce(primary_category, $2),
           phone_raw        = coalesce(phone_raw, $3),
           phone_e164       = coalesce(phone_e164, $4),
           website_url      = coalesce(website_url, $5),
           normalized_domain= coalesce(normalized_domain, $6),
           instagram_url    = coalesce(instagram_url, $7),
           address_line     = coalesce(address_line, $8),
           city             = coalesce(city, $9),
           state            = coalesce(state, $10),
           postal_code      = coalesce(postal_code, $11),
           latitude         = coalesce(latitude, $12),
           longitude        = coalesce(longitude, $13),
           rating           = coalesce(rating, $14),
           reviews_count    = coalesce(reviews_count, $15),
           updated_at       = now()
         where id = $1`,
        [
          companyId,
          candidate.primaryCategory,
          candidate.phoneRaw,
          candidate.phoneE164,
          candidate.websiteUrl,
          candidate.normalizedDomain,
          candidate.instagramUrl,
          candidate.addressLine,
          candidate.city,
          candidate.state,
          candidate.postalCode,
          candidate.latitude,
          candidate.longitude,
          candidate.rating,
          candidate.reviewsCount,
        ],
      );
    },

    /** Rastreabilidade campo a campo (RF-04/RN-04). */
    async insertFieldEvidence(
      companyId: string,
      sourceId: string,
      entries: { field: string; value: string | null }[],
    ): Promise<void> {
      for (const entry of entries) {
        if (entry.value == null) continue;
        await db.query(
          `insert into company_field_evidence
             (company_id, field_name, value_text, source_id, confidence)
           values ($1,$2,$3,$4,'high')`,
          [companyId, entry.field, entry.value, sourceId],
        );
      }
    },

    /** Nota para sinalizar duplicata incerta (RF-06 — não mesclar em silêncio). */
    async addUncertainDuplicateNote(
      companyId: string,
      match: { id: string; name: string; similarity: number },
    ): Promise<void> {
      await db.query(
        `insert into company_notes (company_id, content)
         values ($1, $2)`,
        [
          companyId,
          `Possível duplicata de "${match.name}" (${Math.round(match.similarity * 100)}% de similaridade). Revisar antes de abordar.`,
        ],
      );
    },
  };
}

export type CollectionRepository = ReturnType<
  typeof createCollectionRepository
>;
