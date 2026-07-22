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

  /**
   * Executa `fn` dentro de UMA transação. Commit ao resolver, ROLLBACK ao
   * lançar — a exceção é repassada ao chamador.
   *
   * O `Db` recebido em `fn` é a conexão da transação: toda escrita precisa
   * passar por ele. Usar o `Db` externo dentro do callback escreveria fora da
   * transação e não sofreria rollback.
   *
   * Existe porque a etapa DEDUP grava empresa, fonte e evidência em sequência:
   * sem atomicidade, uma falha no meio (por exemplo, colisão de identidade ao
   * inserir a fonte) deixava a empresa gravada sem proveniência — órfã,
   * invisível para a dedup e fora dos contadores.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
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
