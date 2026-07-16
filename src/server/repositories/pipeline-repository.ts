import type { Db } from "@/lib/database/sql";
import type {
  CompanyRow,
  PipelineEventRow,
  PipelineStage,
} from "@/types/domain";

/** Empresa no quadro + o próximo follow-up pendente (data e motivo). */
export interface PipelineBoardRow extends CompanyRow {
  next_follow_up_at: string | null;
  next_follow_up_reason: string | null;
}

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

    /** Empresas agrupadas por estágio para o quadro Kanban (RF-14), com o
     *  próximo follow-up pendente para exibir prazo e motivo no card. */
    async board(): Promise<PipelineBoardRow[]> {
      return db.query<PipelineBoardRow>(
        `select c.*, f.due_at as next_follow_up_at, f.notes as next_follow_up_reason
         from companies c
         left join lateral (
           select due_at, notes from follow_ups
           where company_id = c.id and status = 'pending' and deleted_at is null
           order by due_at asc limit 1
         ) f on true
         where c.deleted_at is null and c.review_status = 'approved'
         order by
           case c.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
           c.updated_at desc`,
      );
    },
  };
}

export type PipelineRepository = ReturnType<typeof createPipelineRepository>;
