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

async function executeTick(): Promise<void> {
  try {
    const { services } = await createServerContext();
    const result = await services.jobRunner.runTick({
      budgetMs: DEFAULT_TICK_BUDGET_MS,
    });

    logInfo("job.tick.done", {
      picked: result.picked,
      jobId: result.jobId ?? null,
      phase: result.phase ?? null,
      steps: result.steps,
      hasMoreWork: result.hasMoreWork,
    });

    // Encadeia somente enquanto houver trabalho — nunca em laço infinito.
    if (result.hasMoreWork) scheduleNextTick("chain");
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
      const { services } = await createServerContext();
      const result = await services.jobRunner.runTick({
        budgetMs: DEFAULT_TICK_BUDGET_MS,
      });
      if (result.hasMoreWork) scheduleNextTick("chain");
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      const logged = logAndSanitize("api.jobs.tick.sync", error);
      return NextResponse.json(
        { ok: false, error: logged.message, ref: logged.correlationId },
        { status: 500 },
      );
    }
  }

  waitUntil(executeTick());
  return NextResponse.json({ accepted: true }, { status: 202 });
}

/** GET é usado pelo Cron da Vercel, que não envia POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}
