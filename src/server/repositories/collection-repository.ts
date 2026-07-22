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
  /**
   * Implementação compartilhada por `upsertSource` e `upsertSourceChecked`.
   * Função local (e não método) de propósito: os repositories são consumidos
   * também por desestruturação, e um `this` implícito quebraria nesses casos.
   */
  async function upsertSourceChecked(
    companyId: string,
    candidate: NormalizedCandidate,
  ): Promise<{ source: CompanySourceRow; conflict: boolean }> {
    if (candidate.externalId) {
      const existing = await db.query<CompanySourceRow>(
        `select * from company_sources
          where provider = $1 and external_id = $2 limit 1`,
        [candidate.provider, candidate.externalId],
      );
      const found = existing[0];
      if (found && found.company_id !== companyId) {
        return { source: found, conflict: true };
      }
      if (found) {
        const rows = await db.query<CompanySourceRow>(
          `update company_sources
             set last_seen_at = now(), raw_payload = $2,
                 source_url = coalesce($3, source_url), updated_at = now()
           where id = $1 returning *`,
          [found.id, candidate.rawPayload, candidate.sourceUrl],
        );
        return { source: rows[0]!, conflict: false };
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
    return { source: rows[0]!, conflict: false };
  }

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
    /** Nível 1: mesmo provedor + identificador externo (apenas ATIVAS). */
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

    /**
     * Nível 1 para o fluxo de dedup/reativação: mesmo lookup, mas INCLUINDO
     * empresas arquivadas (`deleted_at` preenchido).
     *
     * Razão de existir — causa raiz da falha em DEDUP:
     * `uq_company_sources_provider_ext` é único em (provider, external_id) e
     * NÃO conhece soft delete (company_sources não tem `deleted_at`). Arquivar
     * uma empresa não libera o Place ID dela, mas a consulta acima deixava de
     * enxergá-la. O pipeline concluía "é nova", inseria a empresa e batia na
     * unicidade ao gravar a fonte — deixando uma empresa órfã e abortando o
     * tick.
     *
     * Enxergar a arquivada é o que permite REATIVAR em vez de duplicar. Só
     * este caminho ignora o soft delete; as demais consultas de dedup
     * continuam restritas a empresas ativas.
     */
    async findByProviderExternalIdIncludingDeleted(
      provider: string,
      externalId: string,
    ): Promise<{ company: CompanyRow; sourceId: string } | null> {
      const rows = await db.query<CompanyRow & { source_id: string }>(
        `select c.*, s.id as source_id
           from company_sources s
           join companies c on c.id = s.company_id
          where s.provider = $1 and s.external_id = $2
          -- Ativa primeiro: se por dados legados houver mais de um vínculo,
          -- a empresa viva é a resposta correta, nunca a arquivada.
          order by (c.deleted_at is null) desc, c.created_at
          limit 1`,
        [provider, externalId],
      );
      const row = rows[0];
      if (!row) return null;
      const { source_id, ...company } = row;
      return { company: company as CompanyRow, sourceId: source_id };
    },

    /**
     * Reativa uma empresa arquivada preservando id, histórico, análises,
     * decisões e auditoria. Só limpa `deleted_at` — nenhum campo operacional
     * (estágio, dono, score, contato) é tocado aqui.
     */
    async restoreCompany(companyId: string): Promise<CompanyRow | null> {
      const rows = await db.query<CompanyRow>(
        `update companies
            set deleted_at = null, updated_at = now()
          where id = $1 and deleted_at is not null
          returning *`,
        [companyId],
      );
      return rows[0] ?? null;
    },

    /**
     * Atualiza os dados COLETADOS com o que a coleta trouxe agora.
     *
     * Diferente de `fillMissingCompanyFields` (que só preenche nulos): na
     * reativação a coleta é a informação mais recente e deve prevalecer sobre
     * o que ficou congelado no arquivamento. `coalesce($n, coluna)` mantém o
     * valor antigo quando o provedor não devolveu o campo — atualizar não pode
     * significar apagar.
     *
     * Campos operacionais (pipeline_stage, review_status, score, owner_id,
     * contact_stage, priority) NÃO entram: pertencem ao operador, não ao
     * provedor.
     */
    async refreshCompanyFromCandidate(
      companyId: string,
      candidate: NormalizedCandidate,
    ): Promise<void> {
      await db.query(
        `update companies set
           name             = coalesce($2, name),
           normalized_name  = coalesce($3, normalized_name),
           primary_category = coalesce($4, primary_category),
           phone_raw        = coalesce($5, phone_raw),
           phone_e164       = coalesce($6, phone_e164),
           website_url      = coalesce($7, website_url),
           normalized_domain= coalesce($8, normalized_domain),
           instagram_url    = coalesce($9, instagram_url),
           address_line     = coalesce($10, address_line),
           city             = coalesce($11, city),
           state            = coalesce($12, state),
           postal_code      = coalesce($13, postal_code),
           country_code     = coalesce($14, country_code),
           latitude         = coalesce($15, latitude),
           longitude        = coalesce($16, longitude),
           rating           = coalesce($17, rating),
           reviews_count    = coalesce($18, reviews_count),
           updated_at       = now()
         where id = $1`,
        [
          companyId,
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
        ],
      );
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
     * Registra/atualiza a proveniência (RN-09).
     *
     * A busca prévia é por (provider, external_id) SEM filtrar por empresa —
     * exatamente o escopo de `uq_company_sources_provider_ext`. A versão
     * anterior filtrava também por `company_id`: quando a fonte existia
     * apontando para OUTRA empresa (por exemplo, uma arquivada), o SELECT não
     * a encontrava e o INSERT seguinte violava a unicidade, abortando o tick.
     *
     * Agora, quando a fonte pertence a outra empresa, nada é inserido e o
     * chamador recebe o vínculo real para decidir — o banco nunca vê um INSERT
     * que ele fosse recusar.
     */
    async upsertSource(
      companyId: string,
      candidate: NormalizedCandidate,
    ): Promise<CompanySourceRow> {
      const result = await upsertSourceChecked(companyId, candidate);
      return result.source;
    },

    /**
     * Variante explícita de `upsertSource`. `conflict` indica que o
     * (provider, external_id) já pertencia a outra empresa — a linha devolvida
     * é a existente, e NADA foi inserido nem re-vinculado.
     *
     * Re-vincular em silêncio seria pior que o erro original: mudaria a
     * proveniência de uma empresa sem rastro. Quem chama decide.
     */
    upsertSourceChecked,

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
           -- Telefone só é preenchido se NENHUMA outra empresa ativa já o
           -- tiver: uq_companies_phone é único entre as não arquivadas, e
           -- preencher às cegas transformava um back-fill inofensivo em
           -- violação de constraint — derrubando um candidato legítimo que a
           -- dedup já havia resolvido corretamente pelo Place ID.
           phone_raw        = case
             when phone_raw is not null then phone_raw
             when $4::text is null then $3
             when exists (
               select 1 from companies outra
                where outra.phone_e164 = $4::text
                  and outra.deleted_at is null
                  and outra.id <> $1
             ) then phone_raw
             else $3
           end,
           phone_e164       = case
             when phone_e164 is not null then phone_e164
             when $4::text is null then null
             when exists (
               select 1 from companies outra
                where outra.phone_e164 = $4::text
                  and outra.deleted_at is null
                  and outra.id <> $1
             ) then null
             else $4::text
           end,
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
