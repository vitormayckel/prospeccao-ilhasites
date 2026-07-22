import "server-only";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { type Db, normalizeRows } from "@/lib/database/sql";

const DATA_DIR = join(process.cwd(), ".pglite");
const SUPABASE_DIR = join(process.cwd(), "supabase");

/**
 * Aplica migrations + seed apenas quando o banco está vazio.
 * O arquivo em disco (.pglite) persiste os dados entre requisições e reinícios.
 */
async function initializeIfEmpty(pg: PGlite): Promise<void> {
  const check = await pg.query<{ exists: string | null }>(
    "select to_regclass('public.companies') as exists;",
  );
  if (check.rows[0]?.exists) return;

  const migrationsDir = join(SUPABASE_DIR, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await pg.exec(await readFile(join(migrationsDir, file), "utf8"));
  }
  await pg.exec(await readFile(join(SUPABASE_DIR, "seed.sql"), "utf8"));
}

/** Cria o adapter PGlite file-backed, inicializando o schema/seed se preciso. */
export async function createPgliteDb(): Promise<Db> {
  const pg = new PGlite({ dataDir: DATA_DIR, extensions: { pg_trgm } });
  await pg.waitReady;
  await initializeIfEmpty(pg);

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await pg.query<Record<string, unknown>>(text, params);
      return normalizeRows<T>(result.rows);
    },

    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // `pg.transaction` já faz BEGIN/COMMIT e ROLLBACK ao lançar.
      return pg.transaction(async (txn) => {
        const tx: Db = {
          async query<R>(text: string, params: unknown[] = []): Promise<R[]> {
            const result = await txn.query<Record<string, unknown>>(
              text,
              params,
            );
            return normalizeRows<R>(result.rows);
          },
          // Transação aninhada reusa a corrente: o PGlite não tem savepoint
          // exposto aqui, e aninhar de verdade daria a falsa impressão de um
          // rollback parcial que não existe.
          transaction: (inner) => inner(tx),
        };
        return fn(tx);
      }) as Promise<T>;
    },
  };
}
