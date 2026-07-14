import type { Db } from "@/lib/database/sql";
import type {
  CompanyRow,
  PipelineEventRow,
  PipelineStage,
} from "@/types/domain";

export function createPipelineRepository(db: Db) {
  return {
    async addEvent(input: {
      companyId: string;
      fromStage: PipelineStage | null;
      toStage: PipelineStage;
      reason?: string | null;
      profileId?: string | null;
    }): Promise<PipelineEventRow> {
      const rows = await db.query<PipelineEventRow>(
        `insert into pipeline_events (company_id, from_stage, to_stage, reason, profile_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [
          input.companyId,
          input.fromStage,
          input.toStage,
          input.reason ?? null,
          input.profileId ?? null,
        ],
      );
      return rows[0]!;
    },

    /** Empresas agrupadas por estágio para o quadro Kanban (RF-14). */
    async board(): Promise<CompanyRow[]> {
      return db.query<CompanyRow>(
        `select * from companies
         where deleted_at is null and review_status = 'approved'
         order by
           case priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
           updated_at desc`,
      );
    },
  };
}

export type PipelineRepository = ReturnType<typeof createPipelineRepository>;
