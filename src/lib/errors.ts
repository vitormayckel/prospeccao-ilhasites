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
];

export function isTransientError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => normalized.includes(p));
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
