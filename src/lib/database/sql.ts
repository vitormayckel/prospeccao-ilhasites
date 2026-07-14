// =====================================================================
// Interface de acesso a dados agnóstica de driver.
// Implementada por dois adapters: PGlite (local) e postgres.js (produção).
// =====================================================================

export interface Db {
  /** Executa SQL parametrizado ($1, $2, ...) e devolve as linhas. */
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Normaliza valores vindos do driver para tipos serializáveis/consistentes:
 * - Date → string ISO (evita erro de renderização no React e mantém UTC).
 * Demais tipos (jsonb já vem como objeto; numeric como string) são mantidos.
 */
export function normalizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key in row) {
    const value = row[key];
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out as T;
}

export function normalizeRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => normalizeRow<T>(r));
}
