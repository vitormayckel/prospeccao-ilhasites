import "server-only";
import type { JobsRepository } from "@/server/repositories/jobs-repository";
import { ANALYSIS_RECOVERY_JOB } from "@/server/repositories/jobs-repository";
import type { AiAnalysesRepository } from "@/server/repositories/ai-analyses-repository";
import type { AnalysisService } from "@/server/services/analysis-service";
import { logInfo, logAndSanitize, isTransientError } from "@/lib/errors";

// =====================================================================
// Recuperação de análises como JOB da fila.
//
// Mesmo padrão operacional da prospecção: um clique cria o job, o tick o
// processa em fatias curtas e o encadeamento o leva até zerar a fila. A
// interface só acompanha.
//
// O que este runner NÃO faz, de propósito: buscar, deduplicar ou criar
// empresas. Ele só reprocessa o que já está no banco em `pending_analysis`
// ou `analysis_failed`.
// =====================================================================

/** Empresas por fatia. Casa com a concorrência da análise. */
const BATCH_SIZE = 3;

/** Orçamento de uma fatia, bem abaixo do teto da função. */
export const RECOVERY_TICK_BUDGET_MS = 8_000;

/** Reserva para tentar mais uma empresa sem estourar o orçamento. */
const PER_COMPANY_RESERVE_MS = 2_500;

/** Depois disto uma análise `running` é considerada expirada. */
const STALE_ANALYSIS_MINUTES = 10;

export interface RecoveryTickResult {
  picked: boolean;
  jobId?: string;
  processed: number;
  hasMoreWork: boolean;
}

export function createAnalysisRecoveryRunner(deps: {
  jobs: JobsRepository;
  aiAnalyses: AiAnalysesRepository;
  analysis: AnalysisService;
}) {
  const { jobs, aiAnalyses, analysis } = deps;

  async function runTick(options?: {
    budgetMs?: number;
  }): Promise<RecoveryTickResult> {
    const budgetMs = options?.budgetMs ?? RECOVERY_TICK_BUDGET_MS;
    const startedAt = Date.now();
    const remaining = () => budgetMs - (Date.now() - startedAt);

    const workerId = `recovery-${Math.random().toString(36).slice(2, 10)}`;
    const job = await jobs.claimNext(workerId, ANALYSIS_RECOVERY_JOB);
    if (!job) return { picked: false, processed: 0, hasMoreWork: false };

    let processed = 0;

    try {
      // Devolve à fila o que ficou preso em execuções interrompidas. Sem isto
      // uma análise morta em `running` bloquearia a empresa para sempre.
      const recuperadas = await aiAnalyses.recoverStaleRunning(
        STALE_ANALYSIS_MINUTES,
      );
      if (recuperadas > 0) {
        logInfo("recovery.staleReleased", { jobId: job.id, recuperadas });
      }

      // do/while: um tick que reivindicou o job precisa SEMPRE processar ao
      // menos um lote. Com `while` puro, um orçamento apertado devolvia o job
      // à fila sem fazer nada e dizendo `hasMoreWork` — a corrente girava
      // indefinidamente sem progresso algum.
      do {
        await jobs.renewLock(job.id, workerId);

        // Orçamento de IA é debitado ANTES da chamada, como na prospecção: o
        // teto nunca é ultrapassado nem por uma chamada.
        const granted = await jobs.reserveAiCalls(job.id, BATCH_SIZE);
        if (granted === 0) {
          await finish(job.id, "limite_chamadas_ia");
          return { picked: true, jobId: job.id, processed, hasMoreWork: false };
        }

        const pendentes = await jobs.listPendingForRecovery(job.id, granted);
        if (pendentes.length === 0) {
          await jobs.refundAiCalls(job.id, granted);
          await finish(job.id, "fila_zerada");
          return { picked: true, jobId: job.id, processed, hasMoreWork: false };
        }
        await jobs.refundAiCalls(job.id, granted - pendentes.length);

        const results = await Promise.allSettled(
          pendentes.map((c) => analysis.analyzeCompany(c.id)),
        );

        let ok = 0;
        let falhas = 0;
        for (let i = 0; i < pendentes.length; i++) {
          const r = results[i]!;
          const sucesso = r.status === "fulfilled" && r.value.ok;
          if (sucesso) ok++;
          else falhas++;
          // Cada empresa é tentada UMA vez por job. O registro é o que impede
          // o laço de reprocessamento quando a IA está fora do ar.
          await jobs.markRecoveryAttempt(
            job.id,
            pendentes[i]!.id,
            sucesso ? "analyzed" : "failed",
            sucesso
              ? null
              : r.status === "fulfilled"
                ? (r.value.error ?? "falha na análise")
                : "falha na análise",
          );
        }
        processed += pendentes.length;

        await jobs.bumpCounters(job.id, {
          count_analyzed: ok,
          count_failed: falhas,
        });

        logInfo("recovery.batch", {
          jobId: job.id,
          requested: pendentes.length,
          analyzed: ok,
          failed: falhas,
        });
      } while (remaining() > PER_COMPANY_RESERVE_MS);

      // Orçamento da fatia acabou com trabalho restante: devolve o job à fila
      // imediatamente. O encadeamento pega a próxima fatia.
      await jobs.release(job.id, { phase: "ANALYZE", runAfterSeconds: 0 });
      return { picked: true, jobId: job.id, processed, hasMoreWork: true };
    } catch (error) {
      const logged = logAndSanitize("recovery.tick", error, { jobId: job.id });

      // Erro permanente não merece retry: repetir daria o mesmo resultado.
      if (!isTransientError(error)) {
        await jobs.finish(job.id, {
          status: "failed",
          phase: "FINISHED",
          reason: "erro_permanente",
          errorSummary: logged.message,
          errorDetail: logged.correlationId,
        });
        return { picked: true, jobId: job.id, processed, hasMoreWork: false };
      }

      const { exhausted } = await jobs.scheduleRetry(job.id, {
        delaySeconds: Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1)),
        errorSummary: logged.message,
        errorDetail: logged.correlationId,
      });
      return {
        picked: true,
        jobId: job.id,
        processed,
        hasMoreWork: !exhausted,
      };
    }
  }

  async function finish(jobId: string, reason: string): Promise<void> {
    await jobs.finish(jobId, {
      status: "completed",
      phase: "FINISHED",
      reason,
    });
    logInfo("recovery.finished", { jobId, reason });
  }

  return { runTick };
}

export type AnalysisRecoveryRunner = ReturnType<
  typeof createAnalysisRecoveryRunner
>;
