import "server-only";
import postgres from "postgres";
import { type Db, normalizeRows } from "@/lib/database/sql";

/**
 * Adapter de produção: Postgres do Supabase via connection string (pooler).
 * Ativado quando DATABASE_URL está definida.
 *
 * ---------------------------------------------------------------------
 * 1) Modo do pooler — causa raiz do EMAXCONNSESSION
 *
 * A URL deve apontar para a porta 6543 (transaction mode), não 5432 (session
 * mode). Em session mode cada conexão do cliente segura uma conexão do
 * servidor pela vida inteira, e o teto de 15 do pooler é atingido com apenas
 * 3 instâncias de lambda mornas. Em transaction mode a conexão volta ao pool
 * ao fim de cada transação.
 *
 * `prepare: false` é obrigatório no transaction mode — prepared statements
 * não sobrevivem à troca de conexão entre transações.
 *
 * ---------------------------------------------------------------------
 * 2) Enfileiramento interno do driver — NUNCA deixar acontecer
 *
 * Medido contra o banco real nesta configuração: quando o número de queries
 * simultâneas excede `max`, o postgres.js enfileira internamente e o pool
 * TRAVA DE FORMA PERMANENTE contra o pooler em transaction mode. O primeiro
 * ciclo passa e todos os seguintes expiram — a instância nunca se recupera.
 *
 *   max=2, 4 concorrentes -> 1 ciclo ok, 5 travados
 *   max=3, 4 concorrentes -> 1 ciclo ok, 5 travados
 *   max=4, 4 concorrentes -> 6 ciclos ok
 *   max=5, 4 concorrentes -> 6 ciclos ok
 *
 * O gatilho é exclusivamente `concorrência > max` (o mesmo teste na porta
 * 5432 não trava; idle_timeout e protocolo não influenciam). É o que explica
 * "depois de um erro, Dashboard e Oportunidades param de carregar".
 *
 * Defesa em duas camadas:
 *  - `max` com folga confortável, para o driver nunca precisar enfileirar;
 *  - um limitador nosso, que bloqueia ANTES de chegar ao driver, mantendo o
 *    número real de conexões baixo. Nossa fila é JS puro e drena sempre.
 * ---------------------------------------------------------------------
 */

/** Teto do driver. Folga proposital: o driver nunca deve enfileirar. */
const MAX_CONNECTIONS = 10;

/**
 * Queries simultâneas permitidas por instância. Este é o número que define
 * quantas conexões realmente são abertas (o postgres.js abre sob demanda),
 * então é ele que protege o orçamento do pooler — e não `max`.
 * Mantido acima do pico por request (Dashboard = 4) com margem.
 */
const MAX_IN_FLIGHT = 6;

/** Devolve conexões ociosas ao pooler. Sem isto, uma lambda congelada pela
 *  Vercel continua segurando conexões sem executar nada. */
const IDLE_TIMEOUT_SECONDS = 20;

/** Recicla conexões de vida longa (evita conexões órfãs no pooler). */
const MAX_LIFETIME_SECONDS = 60 * 30;

/** Falha rápido quando o pooler está saturado, em vez de segurar o request. */
const CONNECT_TIMEOUT_SECONDS = 10;

/** Semáforo simples: nunca deixa mais de `limit` queries chegarem ao driver. */
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      // `shift` mantém FIFO: nenhuma query sofre inanição sob carga.
      waiting.shift()?.();
    }
  };
}

export function createPostgresDb(connectionString: string): Db {
  const sql = postgres(connectionString, {
    prepare: false,
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    max_lifetime: MAX_LIFETIME_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    // Notices do servidor não devem poluir o log nem derrubar o processo.
    onnotice: () => {},
  });

  const limit = createLimiter(MAX_IN_FLIGHT);

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await limit(() => sql.unsafe(text, params as never[]));
      return normalizeRows<T>(rows as unknown as Record<string, unknown>[]);
    },
  };
}
