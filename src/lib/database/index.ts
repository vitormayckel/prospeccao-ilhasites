import "server-only";
import type { Db } from "@/lib/database/sql";

export type { Db } from "@/lib/database/sql";

/**
 * Resolve o banco de dados ativo (singleton por processo):
 * - produção: postgres.js quando DATABASE_URL está definida;
 * - local/dev: PGlite file-backed (schema + seed automáticos).
 *
 * O cache em globalThis sobrevive ao hot-reload do Next em desenvolvimento.
 */
const globalForDb = globalThis as unknown as {
  __ilhaDbPromise?: Promise<Db>;
};

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { createPostgresDb } =
      await import("@/lib/database/postgres-adapter");
    return createPostgresDb(url);
  }
  const { createPgliteDb } = await import("@/lib/database/pglite-adapter");
  return createPgliteDb();
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__ilhaDbPromise) {
    globalForDb.__ilhaDbPromise = create();
  }
  return globalForDb.__ilhaDbPromise;
}
