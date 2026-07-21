import "server-only";
import { waitUntil } from "@vercel/functions";
import { logInfo, logAndSanitize } from "@/lib/errors";

// =====================================================================
// Agendamento do próximo tick.
//
// É a ÚNICA peça que difere entre os planos da Vercel. O pipeline em si
// (job-runner) é idêntico nos dois casos:
//
//   Hobby → encadeamento: cada tick dispara o próximo via waitUntil.
//   Pro   → Cron chama a mesma rota; o encadeamento continua válido e
//           apenas acelera o processamento entre execuções do Cron.
//
// Migrar de Hobby para Pro é adicionar uma entrada de cron no vercel.json.
// Nenhuma reescrita, nenhum caminho de código alternativo.
// =====================================================================

/** Cabeçalho de autenticação da rota interna de jobs. */
export const TICK_SECRET_HEADER = "x-jobs-secret";

/** Resolve a URL absoluta da própria aplicação (necessária para o fetch). */
export function resolveSelfUrl(path: string): string | null {
  const explicit = process.env.APP_URL;
  const vercel = process.env.VERCEL_URL;
  const base = explicit || (vercel ? `https://${vercel}` : null);
  if (!base) return null;
  return new URL(path, base.startsWith("http") ? base : `https://${base}`).toString();
}

/**
 * Dispara o próximo tick sem aguardar seu processamento.
 *
 * A rota alvo responde 202 imediatamente, então este fetch resolve rápido e
 * as invocações NÃO se aninham: cada uma vive apenas o seu próprio tick.
 */
export function scheduleNextTick(reason: string): void {
  const secret = process.env.JOBS_TICK_SECRET;
  const url = resolveSelfUrl("/api/jobs/tick");

  if (!secret || !url) {
    // Sem encadeamento configurado o pipeline não trava: o Cron de recovery
    // e o polling da interface continuam acionando ticks.
    logInfo("job.schedule.skipped", {
      reason,
      hasSecret: Boolean(secret),
      hasUrl: Boolean(url),
    });
    return;
  }

  const dispatch = fetch(url, {
    method: "POST",
    headers: { [TICK_SECRET_HEADER]: secret, "content-type": "application/json" },
    body: JSON.stringify({ reason }),
    cache: "no-store",
  })
    .then(() => {
      logInfo("job.schedule.dispatched", { reason });
    })
    .catch((error) => {
      // Falha ao encadear não pode derrubar o tick atual — o progresso já
      // está persistido e o recovery retoma o job.
      logAndSanitize("job.schedule", error, { reason });
    });

  // waitUntil mantém a invocação viva apenas até o disparo ser entregue.
  waitUntil(dispatch);
}
