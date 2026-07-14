import type { Db } from "@/lib/database/sql";
import type { CompanyRow, FollowUpRow } from "@/types/domain";

export interface FollowUpWithCompany extends FollowUpRow {
  company_name: string;
  company_city: string | null;
}

export function createFollowUpsRepository(db: Db) {
  return {
    async create(input: {
      companyId: string;
      dueAt: string;
      type?: string;
      notes?: string | null;
      assignedTo?: string | null;
    }): Promise<FollowUpRow> {
      const rows = await db.query<FollowUpRow>(
        `insert into follow_ups (company_id, due_at, type, notes, assigned_to)
         values ($1, $2, $3, $4, $5) returning *`,
        [
          input.companyId,
          input.dueAt,
          input.type ?? "follow_up",
          input.notes ?? null,
          input.assignedTo ?? null,
        ],
      );
      return rows[0]!;
    },

    async complete(id: string): Promise<FollowUpRow> {
      const rows = await db.query<FollowUpRow>(
        `update follow_ups set status = 'completed', completed_at = now(), updated_at = now()
         where id = $1 returning *`,
        [id],
      );
      return rows[0]!;
    },

    async listByCompany(companyId: string): Promise<FollowUpRow[]> {
      return db.query<FollowUpRow>(
        "select * from follow_ups where company_id = $1 and deleted_at is null order by due_at asc",
        [companyId],
      );
    },

    /** Pendentes com empresa, ordenados por vencimento (dashboard/agenda). */
    async listPending(): Promise<FollowUpWithCompany[]> {
      return db.query<FollowUpWithCompany>(
        `select f.*, c.name as company_name, c.city as company_city
         from follow_ups f
         join companies c on c.id = f.company_id
         where f.status = 'pending' and f.deleted_at is null
         order by f.due_at asc`,
      );
    },
  };
}

export type FollowUpsRepository = ReturnType<typeof createFollowUpsRepository>;
