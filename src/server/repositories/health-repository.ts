import type { Db } from "@/lib/database/sql";

export interface HealthCounts {
  companies: number;
  analyses: number;
  messages: number;
  followUps: number;
}

/** Consultas de diagnóstico do banco para o painel de Saúde do Sistema. */
export function createHealthRepository(db: Db) {
  return {
    /** Leitura trivial — confirma conexão + resposta do banco. */
    async ping(): Promise<boolean> {
      const rows = await db.query<{ ok: number }>("select 1 as ok");
      return rows[0]?.ok === 1;
    },

    async counts(): Promise<HealthCounts> {
      const rows = await db.query<HealthCounts>(
        `select
           (select count(*)::int from companies where deleted_at is null) as "companies",
           (select count(*)::int from ai_analyses) as "analyses",
           (select count(*)::int from messages) as "messages",
           (select count(*)::int from follow_ups where deleted_at is null) as "followUps"`,
      );
      return rows[0]!;
    },

    /** Confirma que um valor existe no enum message_kind (ex.: migration 0005). */
    async messageKindHasValue(value: string): Promise<boolean> {
      const rows = await db.query<{ present: boolean }>(
        `select exists(
           select 1 from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           where t.typname = 'message_kind' and e.enumlabel = $1
         ) as present`,
        [value],
      );
      return rows[0]?.present === true;
    },

    /** Data/hora da análise mais recente registrada (ou null). */
    async lastAnalysisAt(): Promise<string | null> {
      const rows = await db.query<{ at: string | null }>(
        "select max(coalesce(completed_at, created_at)) as at from ai_analyses",
      );
      return rows[0]?.at ?? null;
    },
  };
}

export type HealthRepository = ReturnType<typeof createHealthRepository>;
