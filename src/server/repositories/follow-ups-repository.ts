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

    async findById(id: string): Promise<FollowUpRow | null> {
      const rows = await db.query<FollowUpRow>(
        "select * from follow_ups where id = $1 and deleted_at is null",
        [id],
      );
      return rows[0] ?? null;
    },

    /** Quantos follow-ups de um tipo já existiram (qualquer status) — usado
     *  para saber o próximo passo da cadência de lembretes. */
    async countByType(companyId: string, type: string): Promise<number> {
      const rows = await db.query<{ n: number }>(
        `select count(*)::int as n from follow_ups
         where company_id = $1 and type = $2 and deleted_at is null`,
        [companyId, type],
      );
      return rows[0]?.n ?? 0;
    },

    /** Cancela follow-ups pendentes de uma empresa (opcionalmente por tipo). */
    async cancelPendingByCompany(
      companyId: string,
      type?: string,
    ): Promise<number> {
      const rows = type
        ? await db.query<{ id: string }>(
            `update follow_ups set status = 'cancelled', updated_at = now()
             where company_id = $1 and status = 'pending' and type = $2
               and deleted_at is null returning id`,
            [companyId, type],
          )
        : await db.query<{ id: string }>(
            `update follow_ups set status = 'cancelled', updated_at = now()
             where company_id = $1 and status = 'pending'
               and deleted_at is null returning id`,
            [companyId],
          );
      return rows.length;
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
