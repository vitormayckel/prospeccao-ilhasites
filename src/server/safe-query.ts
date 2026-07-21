import "server-only";
import { logAndSanitize } from "@/lib/errors";

// =====================================================================
// Isolamento de leituras da interface.
//
// Uma consulta que falha NÃO pode derrubar a página inteira. Antes, um
// Promise.all no Server Component rejeitava por completo quando qualquer
// query falhava, jogando Dashboard e Oportunidades no error boundary.
//
// `safeQuery` nunca rejeita: devolve o dado ou um resultado degradado, e o
// componente decide o que renderizar (estado vazio, aviso, card omitido).
// Como nunca rejeita, `Promise.all` volta a ser seguro para paralelizar.
// =====================================================================

export type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; data: null; message: string; correlationId: string };

export async function safeQuery<T>(
  scope: string,
  run: () => Promise<T>,
): Promise<SafeResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    const logged = logAndSanitize(scope, error);
    return {
      ok: false,
      data: null,
      message: logged.message,
      correlationId: logged.correlationId,
    };
  }
}

/**
 * Variante com valor de fallback, para métricas em que "zero" é uma
 * degradação aceitável e o card continua legível.
 *
 * Não use quando o zero puder ser confundido com um dado real — nesses casos
 * prefira `safeQuery` e renderize um estado de indisponibilidade explícito,
 * para não inventar métrica (restrição §17).
 */
export async function safeQueryWithFallback<T>(
  scope: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const result = await safeQuery(scope, run);
  return result.ok ? result.data : fallback;
}
