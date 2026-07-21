import { NextResponse, type NextRequest } from "next/server";
import { createServerContext } from "@/server/context";
import {
  scheduleNextTick,
  TICK_SECRET_HEADER,
} from "@/server/services/tick-scheduler";
import { logInfo, logAndSanitize } from "@/lib/errors";

// =====================================================================
// Recovery — acionado pelo Cron diário. NUNCA é o motor do pipeline:
// serve só para consertar o que ficou para trás.
//
//  - solta locks expirados de jobs presos em `running`;
//  - devolve à fila execuções interrompidas;
//  - expira análises de IA presas em `running`;
//  - dispara um tick para retomar o que voltou à fila.
// =====================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Jobs parados além disto são considerados abandonados. */
const ABANDONED_AFTER_MINUTES = 15;

function authorize(request: NextRequest): boolean {
  const secret = process.env.JOBS_TICK_SECRET;
  if (secret && request.headers.get(TICK_SECRET_HEADER) === secret) return true;
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`,
  );
}

async function handle(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { services, repositories } = await createServerContext();

    const recoveredJobs =
      await repositories.jobs.recoverAbandoned(ABANDONED_AFTER_MINUTES);
    const recoveredAnalyses = await services.analysis.recoverStaleAnalyses();

    logInfo("job.recovery", { recoveredJobs, recoveredAnalyses });

    // Se algo voltou à fila, retoma imediatamente em vez de esperar 24h.
    if (recoveredJobs > 0) scheduleNextTick("recovery");

    return NextResponse.json({ ok: true, recoveredJobs, recoveredAnalyses });
  } catch (error) {
    const logged = logAndSanitize("api.jobs.recover", error);
    return NextResponse.json(
      { ok: false, error: logged.message, ref: logged.correlationId },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
