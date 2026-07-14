import "server-only";
import postgres from "postgres";
import { type Db, normalizeRows } from "@/lib/database/sql";

/**
 * Adapter de produção: Postgres do Supabase via connection string (pooler).
 * Ativado quando DATABASE_URL está definida.
 */
export function createPostgresDb(connectionString: string): Db {
  const sql = postgres(connectionString, {
    prepare: false,
    max: 5,
  });

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.unsafe(text, params as never[]);
      return normalizeRows<T>(rows as unknown as Record<string, unknown>[]);
    },
  };
}
