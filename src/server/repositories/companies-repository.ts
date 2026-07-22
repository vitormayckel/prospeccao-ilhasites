import type { Db } from "@/lib/database/sql";
import type {
  CompanyRow,
  CompanySourceRow,
  AiAnalysisRow,
  CompanyDecisionRow,
  CompanyNoteRow,
  MessageRow,
  FollowUpRow,
  PipelineEventRow,
  AuditEventRow,
  PipelineStage,
  Priority,
  ReviewStatus,
  ContactStage,
  ApproachChannel,
  ContactRole,
  NextActionStatus,
  WebsiteClass,
  CommercialFactor,
  CommercialScoredBy,
} from "@/types/domain";
import type { OpportunityFilters } from "@/lib/validation/company";

/**
 * Estado da análise, derivado por consulta (não persistido):
 *  awaiting       — importada, ainda não entrou na fila da IA
 *  running        — análise em andamento agora
 *  stale          — análise presa há mais de 10 min (tick morto)
 *  retry_pending  — última tentativa falhou; será reprocessada
 */
export type AnalysisState =
  | "awaiting"
  | "running"
  | "stale"
  | "retry_pending"
  | "desynced";

export interface CompanyListRow extends CompanyRow {
  analysis_state: AnalysisState | null;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CompanyDetail {
  company: CompanyRow;
  sources: CompanySourceRow[];
  analyses: AiAnalysisRow[];
  decisions: CompanyDecisionRow[];
  notes: CompanyNoteRow[];
  messages: MessageRow[];
  followUps: FollowUpRow[];
  pipelineEvents: PipelineEventRow[];
  auditEvents: AuditEventRow[];
}

const PRIORITY_RANK = `case c.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end`;

const WEBSITE_CLASS_RANK = `case c.website_class when 'none' then 4 when 'very_poor' then 3 when 'reasonable' then 2 when 'professional' then 1 else 0 end`;

/**
 * Cada critério devolve a cláusula ORDER BY COMPLETA, já com a direção
 * aplicada a TODAS as suas expressões.
 *
 * Antes isto era um texto solto e a direção era concatenada uma única vez no
 * fim. Para `commercial`, que tem duas expressões separadas por vírgula, o
 * `desc`/`asc` caía só na segunda (o desempate por classe de site) e a
 * primeira — o score — ficava implicitamente ASC para sempre. Clicar na seta
 * trocava a URL e o ícone, mas a lista praticamente não mudava.
 *
 * `nulls last` explícito em vez de `coalesce(..., -1)`: o coalesce só põe os
 * nulos no fim quando a ordem é decrescente; em crescente eles vinham
 * primeiro. Com `nulls last` empresas sem score ficam no fim nos dois
 * sentidos.
 */
const SORT_SQL: Record<
  OpportunityFilters["sort"],
  (direcao: "asc" | "desc") => string
> = {
  // Score comercial é o critério; a classe do site (A>B>C>D) só desempata.
  commercial: (d) =>
    `c.commercial_score ${d} nulls last, ${WEBSITE_CLASS_RANK} ${d}`,
  priority: (d) => `${PRIORITY_RANK} ${d}`,
  name: (d) => `c.normalized_name ${d} nulls last`,
  created_at: (d) => `c.created_at ${d}`,
};

/** Acesso a `companies` e agregados relacionados. */
export function createCompaniesRepository(db: Db) {
  async function findById(id: string): Promise<CompanyRow | null> {
    const rows = await db.query<CompanyRow>(
      "select * from companies where id = $1 and deleted_at is null",
      [id],
    );
    return rows[0] ?? null;
  }

  return {
    findById,

    async list(filters: OpportunityFilters): Promise<Paginated<CompanyListRow>> {
      const where: string[] = ["c.deleted_at is null"];
      const params: unknown[] = [];

      if (filters.reviewStatus) {
        params.push(filters.reviewStatus);
        where.push(`c.review_status = $${params.length}`);
      }
      if (filters.priority) {
        params.push(filters.priority);
        where.push(`c.priority = $${params.length}`);
      }
      if (filters.stage) {
        params.push(filters.stage);
        where.push(`c.pipeline_stage = $${params.length}`);
      }
      if (filters.city) {
        params.push(`%${filters.city}%`);
        where.push(`c.city ilike $${params.length}`);
      }
      if (filters.search) {
        params.push(`%${filters.search.toLowerCase()}%`);
        where.push(`c.normalized_name ilike $${params.length}`);
      }

      const whereSql = where.join(" and ");
      const direcao = filters.order === "asc" ? "asc" : "desc";
      // `c.id` fecha a ordenação: sem um critério único no fim, duas empresas
      // com o mesmo score e o mesmo created_at podem trocar de posição entre
      // páginas e repetir ou sumir da paginação.
      const orderSql = `${SORT_SQL[filters.sort](direcao)}, c.created_at desc, c.id desc`;

      const totalRows = await db.query<{ total: number }>(
        `select count(*)::int as total from companies c where ${whereSql}`,
        params,
      );
      const total = totalRows[0]?.total ?? 0;

      const offset = (filters.page - 1) * filters.pageSize;
      // `analysis_state` distingue "aguardando análise" de "em análise" e
      // detecta análise expirada — sem isto um registro cujo tick morreu
      // ficaria "Em análise" para sempre (§11).
      const rows = await db.query<CompanyListRow>(
        `select c.*,
            case
              when c.review_status <> 'pending_analysis' then null
              when a.id is null then 'awaiting'
              when a.status = 'running'
                   and coalesce(a.started_at, a.created_at)
                       < now() - interval '10 minutes' then 'stale'
              when a.status = 'running' then 'running'
              when a.status = 'failed' then 'retry_pending'
              -- Análise concluída com a empresa ainda em pending_analysis é
              -- dessincronia entre ai_analyses e companies: a linha existe e
              -- tem score, mas a fila mostrava "Aguardando análise" para
              -- sempre porque este caso caía no ramo final.
              when a.status = 'completed' then 'desynced'
              else 'awaiting'
            end as analysis_state
         from companies c
         left join lateral (
           select id, status, started_at, created_at
             from ai_analyses
            where company_id = c.id
            order by created_at desc
            limit 1
         ) a on true
         where ${whereSql}
         order by ${orderSql}
         limit ${filters.pageSize} offset ${offset}`,
        params,
      );

      return {
        rows,
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
      };
    },

    /** Detalhe consolidado com todas as relações (Blueprint RF-16). */
    async getDetail(id: string): Promise<CompanyDetail | null> {
      const company = await findById(id);
      if (!company) return null;

      const [
        sources,
        analyses,
        decisions,
        notes,
        messages,
        followUps,
        events,
        auditEvents,
      ] = await Promise.all([
        db.query<CompanySourceRow>(
          "select * from company_sources where company_id = $1 order by collected_at desc",
          [id],
        ),
        db.query<AiAnalysisRow>(
          "select * from ai_analyses where company_id = $1 order by created_at desc",
          [id],
        ),
        db.query<CompanyDecisionRow>(
          "select * from company_decisions where company_id = $1 order by created_at desc",
          [id],
        ),
        db.query<CompanyNoteRow>(
          "select * from company_notes where company_id = $1 and deleted_at is null order by created_at desc",
          [id],
        ),
        db.query<MessageRow>(
          "select * from messages where company_id = $1 order by created_at desc",
          [id],
        ),
        db.query<FollowUpRow>(
          "select * from follow_ups where company_id = $1 and deleted_at is null order by due_at asc",
          [id],
        ),
        db.query<PipelineEventRow>(
          "select * from pipeline_events where company_id = $1 order by created_at desc",
          [id],
        ),
        db.query<AuditEventRow>(
          "select * from audit_events where entity_type = 'company' and entity_id = $1 order by created_at desc",
          [id],
        ),
      ]);

      return {
        company,
        sources,
        analyses,
        decisions,
        notes,
        messages,
        followUps,
        pipelineEvents: events,
        auditEvents,
      };
    },

    async updateReviewAndStage(
      id: string,
      values: {
        reviewStatus?: ReviewStatus;
        pipelineStage?: PipelineStage;
        nextActionAt?: string | null;
        score?: number | null;
      },
    ): Promise<CompanyRow> {
      const sets: string[] = ["updated_at = now()"];
      const params: unknown[] = [];
      if (values.reviewStatus !== undefined) {
        params.push(values.reviewStatus);
        sets.push(`review_status = $${params.length}`);
      }
      if (values.pipelineStage !== undefined) {
        params.push(values.pipelineStage);
        sets.push(`pipeline_stage = $${params.length}`);
      }
      if (values.nextActionAt !== undefined) {
        params.push(values.nextActionAt);
        sets.push(`next_action_at = $${params.length}`);
      }
      if (values.score !== undefined) {
        params.push(values.score);
        sets.push(`score = $${params.length}`);
      }
      params.push(id);
      const rows = await db.query<CompanyRow>(
        `update companies set ${sets.join(", ")} where id = $${params.length} returning *`,
        params,
      );
      return rows[0]!;
    },

    /**
     * Persiste a classificação comercial (migration 0011). Chamado tanto pelo
     * pré-filtro determinístico (`by='prefilter'`) quanto após a IA
     * (`by='ai'`). Não toca em `score` (o score analítico da IA é à parte).
     */
    async setCommercialClassification(
      id: string,
      values: {
        websiteClass: WebsiteClass;
        commercialScore: number;
        factors: CommercialFactor[];
        by: CommercialScoredBy;
      },
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        `update companies set
           website_class = $1,
           commercial_score = $2,
           commercial_factors = $3::jsonb,
           commercial_scored_at = now(),
           commercial_scored_by = $4,
           updated_at = now()
         where id = $5
         returning *`,
        [
          values.websiteClass,
          values.commercialScore,
          JSON.stringify(values.factors),
          values.by,
          id,
        ],
      );
      return rows[0]!;
    },

    /**
     * Competitividade do mercado local: quantos concorrentes do mesmo mercado
     * (cidade × categoria) já têm domínio próprio. Leitura pura; a própria
     * empresa é excluída. Sem cidade/categoria, retorna amostra vazia.
     */
    async getMarketCompetitiveness(
      city: string | null,
      category: string | null,
      excludeId?: string,
    ): Promise<{ total: number; withSite: number }> {
      if (!city || !category) return { total: 0, withSite: 0 };
      const rows = await db.query<{ total: number; with_site: number }>(
        `select
           count(*)::int as total,
           count(*) filter (where normalized_domain is not null)::int as with_site
         from companies
         where deleted_at is null
           and lower(city) = lower($1)
           and primary_category = $2
           and ($3::uuid is null or id <> $3::uuid)`,
        [city, category, excludeId ?? null],
      );
      const r = rows[0] ?? { total: 0, with_site: 0 };
      return { total: r.total, withSite: r.with_site };
    },

    async setContactStage(
      id: string,
      stage: ContactStage,
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        "update companies set contact_stage = $1, updated_at = now() where id = $2 returning *",
        [stage, id],
      );
      return rows[0]!;
    },

    async setPriority(id: string, priority: Priority): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        "update companies set priority = $1, updated_at = now() where id = $2 returning *",
        [priority, id],
      );
      return rows[0]!;
    },

    /** Classificações operacionais da Sprint 4 (canal, interlocutor, próxima
     *  ação). Uma coluna por chamada, todas em companies. */
    async setApproachChannel(
      id: string,
      value: ApproachChannel,
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        "update companies set approach_channel = $1, updated_at = now() where id = $2 returning *",
        [value, id],
      );
      return rows[0]!;
    },

    async setContactRole(
      id: string,
      value: ContactRole | null,
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        "update companies set contact_role = $1, updated_at = now() where id = $2 returning *",
        [value, id],
      );
      return rows[0]!;
    },

    async setNextActionStatus(
      id: string,
      value: NextActionStatus | null,
    ): Promise<CompanyRow> {
      const rows = await db.query<CompanyRow>(
        "update companies set next_action_status = $1, updated_at = now() where id = $2 returning *",
        [value, id],
      );
      return rows[0]!;
    },
  };
}

export type CompaniesRepository = ReturnType<typeof createCompaniesRepository>;
