import "server-only";
import { ZodError } from "zod";

// =====================================================================
// Sanitização de erros e log estruturado.
//
// Regra: o usuário nunca vê detalhe técnico (SQL, stack, credencial, host
// do banco). O detalhe vai só para o log do servidor, correlacionado por um
// ID curto que também é devolvido ao usuário para diagnóstico.
// =====================================================================

/** Mensagem padrão quando a operação pode ser retomada depois. */
export const RETRYABLE_MESSAGE =
  "Não foi possível concluir esta etapa agora. O processamento será retomado automaticamente.";

/** Mensagem padrão para falha de leitura de dados. */
export const READ_FAILURE_MESSAGE =
  "Não foi possível carregar estes dados agora. Tente novamente em instantes.";

// ---------------------------------------------------------------------
// Mensagens de ESCRITA.
//
// Antes, toda falha não-transitória caía em READ_FAILURE_MESSAGE — inclusive
// violação de constraint ao gravar. O operador via "não foi possível carregar
// estes dados" para um erro de gravação, o que não descreve o que aconteceu
// nem sugere a ação correta.
// ---------------------------------------------------------------------

/** Falha ao persistir uma empresa/candidato da coleta. */
export const WRITE_FAILURE_MESSAGE =
  "Falha ao salvar os dados desta empresa. Nenhuma alteração parcial foi mantida.";

/** Colisão de identidade forte (mesmo Place ID, telefone ou domínio). */
export const IDENTITY_CONFLICT_MESSAGE =
  "Conflito de identidade detectado: este registro já existe vinculado a outra empresa.";

/** Encerramento por erro que não se resolve sozinho — retry não ajuda. */
export const PERMANENT_FAILURE_MESSAGE =
  "Execução interrompida por erro permanente. Nenhuma nova tentativa automática será feita.";

/** ID curto para correlacionar a mensagem do usuário com a linha de log. */
export function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Remove segredos e identificadores de infraestrutura de qualquer texto antes
 * de ele chegar ao log. Defesa em profundidade: mensagens de driver e de API
 * costumam ecoar a connection string ou a chave inteira.
 */
export function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, "[REDACTED_KEY]")
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+)/g, "[REDACTED_JWT]")
    .replace(
      /\b(api[_-]?key|apikey|password|senha|token|secret|authorization)\b\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    );
}

/** Erros transitórios de infraestrutura — vale retomar depois. */
const TRANSIENT_PATTERNS = [
  "emaxconnsession",
  "max clients reached",
  "too many clients",
  "connection terminated",
  "connect_timeout",
  "econnreset",
  "etimedout",
  "econnrefused",
  "timeout",
  // Rede/DNS instável.
  "enotfound",
  "eai_again",
  "socket hang up",
  "fetch failed",
  // Timeout do provedor de coleta (mensagem em português, não casa com
  // "timeout"). Sem isto, uma lentidão do Google encerraria o job.
  "excedeu o tempo limite",
  // Indisponibilidade temporária do provedor: 429 e 5xx são retentáveis.
  // O provedor formata "Google Places retornou <status>: ...".
  "retornou 429",
  "retornou 500",
  "retornou 502",
  "retornou 503",
  "retornou 504",
  "rate limit",
  "resource_exhausted",
  "unavailable",
];

/**
 * Erros PERMANENTES: repetir produz exatamente o mesmo resultado.
 *
 * Motivados pela falha real em DEDUP, em que uma violação de unicidade
 * (SQLSTATE 23505) foi repetida até esgotar `max_attempts`, gastando três
 * tentativas idênticas e encerrando o job com um motivo genérico.
 */
const PERMANENT_SQLSTATES = new Set([
  "23505", // unique_violation
  "23503", // foreign_key_violation
  "23502", // not_null_violation
  "23514", // check_violation
  "22P02", // invalid_text_representation
  "22001", // string_data_right_truncation
  "42703", // undefined_column
  "42P01", // undefined_table
]);

const PERMANENT_PATTERNS = [
  "duplicate key value",
  "violates unique constraint",
  "violates foreign key constraint",
  "violates not-null constraint",
  "violates check constraint",
  "invalid input syntax",
  "column does not exist",
  "relation does not exist",
];

/** SQLSTATE do erro, quando o driver o expõe (postgres.js e PGlite expõem). */
export function sqlStateOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isTransientError(error: unknown): boolean {
  // Um erro permanente nunca é transitório, mesmo que a mensagem contenha
  // alguma das palavras da lista acima.
  if (isPermanentError(error)) return false;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => normalized.includes(p));
}

/** Determinístico: retentar não muda o resultado. Encerra o job na hora. */
export function isPermanentError(error: unknown): boolean {
  if (error instanceof ZodError) return true;
  const state = sqlStateOf(error);
  if (state && PERMANENT_SQLSTATES.has(state)) return true;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return PERMANENT_PATTERNS.some((p) => normalized.includes(p));
}

/**
 * Mensagem de ESCRITA adequada ao erro, para exibir ao operador.
 * Nunca inclui SQL, nome de constraint, stack ou credencial.
 */
export function toWriteFailureMessage(error: unknown): string {
  if (sqlStateOf(error) === "23505" || isUniqueViolationMessage(error)) {
    return IDENTITY_CONFLICT_MESSAGE;
  }
  // Só promete retomada automática se de fato houver retry. Um erro
  // desconhecido e não-transitório encerra o job na hora (ver
  // `handleTickFailure`): dizer "será retomado automaticamente" ali seria
  // mentir para o operador, que ficaria esperando algo que não vem.
  if (isTransientError(error)) return RETRYABLE_MESSAGE;
  return WRITE_FAILURE_MESSAGE;
}

function isUniqueViolationMessage(error: unknown): boolean {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    raw.includes("duplicate key value") ||
    raw.includes("violates unique constraint")
  );
}

export interface LoggedError {
  /** Mensagem segura para exibir ao usuário. */
  message: string;
  correlationId: string;
  transient: boolean;
}

/**
 * Registra o erro completo (sanitizado) no servidor e devolve a mensagem
 * amigável correspondente. Único caminho permitido para transformar uma
 * exceção em texto de interface.
 */
export function logAndSanitize(
  scope: string,
  error: unknown,
  context: Record<string, string | number | null | undefined> = {},
): LoggedError {
  const correlationId = newCorrelationId();
  const transient = isTransientError(error);
  const detail = error instanceof Error ? error.message : String(error ?? "");

  console.error(
    JSON.stringify({
      level: "error",
      scope,
      correlationId,
      transient,
      message: redact(detail),
      ...context,
      at: new Date().toISOString(),
    }),
  );

  return {
    message: transient ? RETRYABLE_MESSAGE : READ_FAILURE_MESSAGE,
    correlationId,
    transient,
  };
}

/** Igual a `logAndSanitize`, devolvendo só o texto com o ID de correlação. */
export function toUserMessage(
  scope: string,
  error: unknown,
  context: Record<string, string | number | null | undefined> = {},
): string {
  const logged = logAndSanitize(scope, error, context);
  return `${logged.message} (ref: ${logged.correlationId})`;
}

/**
 * Converte a exceção de uma Server Action em mensagem de interface.
 *
 * Erros de validação (Zod) são de autoria do próprio formulário e descrevem o
 * campo inválido — são preservados, senão o usuário perde o retorno de
 * validação. Qualquer outra exceção é sanitizada: pode carregar SQL,
 * connection string ou chave de API na mensagem do driver.
 */
export function toActionError(
  scope: string,
  error: unknown,
  fallback: string,
  context: Record<string, string | number | null | undefined> = {},
): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  const logged = logAndSanitize(scope, error, context);
  const base = logged.transient ? logged.message : fallback;
  return `${base} (ref: ${logged.correlationId})`;
}

/** Log estruturado de eventos que não são erro (observabilidade §13). */
export function logInfo(
  scope: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
): void {
  console.log(
    JSON.stringify({
      level: "info",
      scope,
      ...data,
      at: new Date().toISOString(),
    }),
  );
}
