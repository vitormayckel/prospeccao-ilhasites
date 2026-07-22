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

    // Retoma se houver QUALQUER trabalho reivindicável — não apenas o que
    // acabou de ser recuperado.
    //
    // `recoverAbandoned` só mexe em jobs presos em 'running' com lock
    // expirado. Um job em 'queued' cuja corrente de ticks se perdeu não era
    // recuperado por ninguém e ficava parado indefinidamente. Era o último
    // caminho pelo qual uma execução podia depender de alguém abrir a tela.
    const pendente = await repositories.jobs.msUntilNextRunnable();

    logInfo("job.recovery", {
      recoveredJobs,
      recoveredAnalyses,
      pendingInMs: pendente,
      chaining: pendente !== null,
    });

    if (pendente !== null) await scheduleNextTick("recovery");

    return NextResponse.json({
      ok: true,
      recoveredJobs,
      recoveredAnalyses,
      resumed: pendente !== null,
    });
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
