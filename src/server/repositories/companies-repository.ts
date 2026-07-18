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
} from "@/types/domain";
import type { OpportunityFilters } from "@/lib/validation/company";

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

const SORT_SQL: Record<OpportunityFilters["sort"], string> = {
  priority: PRIORITY_RANK,
  score: "c.score",
  name: "c.normalized_name",
  created_at: "c.created_at",
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

    async list(filters: OpportunityFilters): Promise<Paginated<CompanyRow>> {
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
      const orderSql = `${SORT_SQL[filters.sort]} ${filters.order === "asc" ? "asc" : "desc"} nulls last, c.created_at desc`;

      const totalRows = await db.query<{ total: number }>(
        `select count(*)::int as total from companies c where ${whereSql}`,
        params,
      );
      const total = totalRows[0]?.total ?? 0;

      const offset = (filters.page - 1) * filters.pageSize;
      const rows = await db.query<CompanyRow>(
        `select c.* from companies c
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
