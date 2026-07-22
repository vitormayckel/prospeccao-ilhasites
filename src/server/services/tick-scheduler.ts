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
 * Dispara o próximo tick e devolve a promessa do DISPARO (não do
 * processamento). A rota alvo responde 202 de imediato, então isto resolve
 * rápido e as invocações não se aninham.
 *
 * ---------------------------------------------------------------------
 * Por que devolver a promessa — causa da execução que parava sozinha
 *
 * A versão anterior era `void` e se apoiava só em `waitUntil` daqui. Só que
 * quem chama isto já roda DENTRO de um `waitUntil` (a rota responde 202 e
 * processa o tick em segundo plano). Registrar um novo `waitUntil` de dentro
 * de outro que já está drenando não é garantido: a invocação podia ser
 * congelada antes de o fetch sair, e a corrente morria em silêncio. O
 * sintoma era exatamente o observado — o job avançava enquanto a interface
 * fazia polling e parava assim que a aba fechava.
 *
 * Devolvendo a promessa, o chamador a inclui no SEU `waitUntil`, que é o
 * único registrado durante o ciclo de vida da requisição. O `waitUntil`
 * local continua aqui como rede de segurança para quem chama sem aguardar
 * (por exemplo, a Server Action de nudge).
 */
export function scheduleNextTick(reason: string): Promise<void> {
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
    return Promise.resolve();
  }

  const dispatch = fetch(url, {
    method: "POST",
    headers: { [TICK_SECRET_HEADER]: secret, "content-type": "application/json" },
    body: JSON.stringify({ reason }),
    cache: "no-store",
  })
    .then((response) => {
      logInfo("job.schedule.dispatched", { reason, status: response.status });
    })
    .catch((error) => {
      // Falha ao encadear não pode derrubar o tick atual — o progresso já
      // está persistido e o recovery retoma o job.
      logAndSanitize("job.schedule", error, { reason });
    });

  // Rede de segurança para chamadores que não aguardam a promessa.
  waitUntil(dispatch);
  return dispatch;
}
