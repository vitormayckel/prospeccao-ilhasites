import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerContext } from "@/server/context";
import {
  scheduleNextTick,
  TICK_SECRET_HEADER,
} from "@/server/services/tick-scheduler";
import { DEFAULT_TICK_BUDGET_MS } from "@/server/services/job-runner";
import { logInfo, logAndSanitize } from "@/lib/errors";

// =====================================================================
// Rota interna do pipeline. Executa UM tick (fatia curta) e encadeia o
// próximo se ainda houver trabalho.
//
// Responde 202 imediatamente e roda o tick em waitUntil para que a invocação
// que a chamou não fique viva esperando. O trabalho mantido é sempre UMA
// fatia limitada por orçamento (~8s) — nunca o pipeline inteiro.
// =====================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60; // respeitado conforme o plano; teto do tick é menor

/** Autoriza Cron da Vercel ou chamada interna com o segredo compartilhado. */
function authorize(request: NextRequest): boolean {
  const secret = process.env.JOBS_TICK_SECRET;
  if (secret && request.headers.get(TICK_SECRET_HEADER) === secret) return true;

  // Cron da Vercel assina com CRON_SECRET no Authorization.
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return true;
  }
  return false;
}

/**
 * Orçamento total da invocação. Fica abaixo de `maxDuration` (60s) com folga
 * para encadear o próximo antes de a função ser encerrada.
 */
const INVOCATION_BUDGET_MS = 45_000;

/** Espera máxima, dentro da invocação, por um job em backoff. */
const MAX_BACKOFF_WAIT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drena o máximo de ticks que couber nesta invocação e, ao final, encadeia a
 * próxima SE ainda houver trabalho.
 *
 * Antes era um tick por invocação. Uma execução de 16 minutos precisava de
 * ~100 saltos de encadeamento, e bastava um falhar para o pipeline parar. Com
 * o laço, a mesma execução usa ~20 saltos: menos oportunidades de quebrar e
 * menos invocações cobradas.
 */
async function drainTicks(reason: string): Promise<void> {
  const startedAt = Date.now();
  const remaining = () => INVOCATION_BUDGET_MS - (Date.now() - startedAt);

  try {
    const { services, repositories } = await createServerContext();
    let ticks = 0;

    while (remaining() > DEFAULT_TICK_BUDGET_MS) {
      const result = await services.jobRunner.runTick({
        budgetMs: DEFAULT_TICK_BUDGET_MS,
      });
      ticks++;

      logInfo("job.tick.done", {
        picked: result.picked,
        jobId: result.jobId ?? null,
        phase: result.phase ?? null,
        steps: result.steps,
        hasMoreWork: result.hasMoreWork,
      });

      if (result.picked && result.hasMoreWork) continue;

      // Nada reivindicável AGORA. Pode ser: (a) fila vazia — encerra; ou
      // (b) job em backoff, ou preso por outro worker — nesse caso esperar
      // um pouco aqui é o que mantém a corrente viva sem depender de mais
      // um salto de rede.
      const waitMs = await repositories.jobs.msUntilNextRunnable();
      if (waitMs === null) break;
      if (waitMs > MAX_BACKOFF_WAIT_MS || waitMs + DEFAULT_TICK_BUDGET_MS > remaining()) {
        break; // não cabe nesta invocação: o encadeamento abaixo assume
      }
      await sleep(waitMs + 250);
    }

    // Encadeia apenas se sobrou trabalho. `null` = fila vazia, e a corrente
    // termina naturalmente — nunca há laço infinito.
    const pendente = await repositories.jobs.msUntilNextRunnable();
    logInfo("job.tick.invocation", {
      reason,
      ticks,
      durationMs: Date.now() - startedAt,
      chaining: pendente !== null,
      nextInMs: pendente,
    });

    if (pendente !== null) {
      // AGUARDADO de propósito: este await é o que garante que o disparo saia
      // antes de a invocação ser congelada. Era exatamente aqui que a corrente
      // morria quando a aba do navegador fechava.
      await scheduleNextTick("chain");
    }
  } catch (error) {
    // O tick já trata suas falhas internamente; isto cobre falha ao montar o
    // contexto (ex.: banco indisponível). Não relança: a rota não pode
    // derrubar nada, e o Cron de recovery retoma o job.
    logAndSanitize("api.jobs.tick", error);
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  // Modo síncrono para Cron, testes e diagnóstico: devolve o resultado real.
  if (url.searchParams.get("sync") === "1") {
    try {
      const { services, repositories } = await createServerContext();
      const result = await services.jobRunner.runTick({
        budgetMs: DEFAULT_TICK_BUDGET_MS,
      });
      const pendente = await repositories.jobs.msUntilNextRunnable();
      if (pendente !== null) await scheduleNextTick("chain");
      return NextResponse.json({ ok: true, ...result, nextInMs: pendente });
    } catch (error) {
      const logged = logAndSanitize("api.jobs.tick.sync", error);
      return NextResponse.json(
        { ok: false, error: logged.message, ref: logged.correlationId },
        { status: 500 },
      );
    }
  }

  const body = await request.json().catch(() => ({}) as { reason?: string });
  waitUntil(drainTicks(String(body?.reason ?? "chain")));
  return NextResponse.json({ accepted: true }, { status: 202 });
}

/** GET é usado pelo Cron da Vercel, que não envia POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}
