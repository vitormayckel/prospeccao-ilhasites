import { PageHeader } from "@/components/layout/page-header";
import { SectionLabel } from "@/components/ui/section-label";
import { QueueSummaryStrip } from "@/features/dashboard/components/queue-summary";
import { SearchActivity } from "@/features/dashboard/components/search-activity";
import { MetricsRow } from "@/features/dashboard/components/metrics-row";
import { ExecutionProgress } from "@/features/dashboard/components/execution-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { createServerContext } from "@/server/context";
import { safeQuery } from "@/server/safe-query";

export const dynamic = "force-dynamic";

/**
 * Visão geral — resumo executivo da operação.
 *
 * Sem saudação, sem frase introdutória e sem a lista de tarefas, que apenas
 * repetia o que a página de Oportunidades já faz. Cada bloco é lido de forma
 * independente: uma consulta com falha degrada só o seu card, nunca a página.
 */
export default async function DashboardPage() {
  const context = await safeQuery("dashboard.context", createServerContext);

  if (!context.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visão geral" />
        <UnavailableState
          message={context.message}
          correlationId={context.correlationId}
        />
      </div>
    );
  }

  const { repositories } = context.data;
  const [queueSummary, latestSearch, metrics, recentJobs] = await Promise.all([
    safeQuery("dashboard.queueSummary", () =>
      repositories.dashboard.getQueueSummary(),
    ),
    safeQuery("dashboard.latestSearch", () =>
      repositories.dashboard.getLatestSearch(),
    ),
    safeQuery("dashboard.monthlyMetrics", () =>
      repositories.dashboard.getMonthlyMetrics(),
    ),
    safeQuery("dashboard.recentJobs", () => repositories.jobs.listRecent(1)),
  ]);

  const currentJob = recentJobs.ok ? (recentJobs.data[0] ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Visão geral" />

      {/* 1. Execução atual — o que a máquina está fazendo agora */}
      {currentJob ? (
        <ExecutionProgress initialJob={currentJob} />
      ) : recentJobs.ok ? (
        <EmptyState
          title="Nenhuma execução ainda"
          description="Ao iniciar uma prospecção, o progresso aparece aqui em tempo real."
        />
      ) : (
        <UnavailableState
          message={recentJobs.message}
          correlationId={recentJobs.correlationId}
        />
      )}

      {/* 2. Estado da operação comercial */}
      <section className="space-y-3">
        <SectionLabel>Operação</SectionLabel>
        {queueSummary.ok ? (
          <QueueSummaryStrip summary={queueSummary.data} />
        ) : (
          <UnavailableState
            message={queueSummary.message}
            correlationId={queueSummary.correlationId}
          />
        )}
      </section>

      {/* 3. Funil e última coleta */}
      <section className="grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-card border border-border-subtle bg-surface-1/40 p-5">
          {metrics.ok ? (
            <MetricsRow metrics={metrics.data} />
          ) : (
            <UnavailableState
              variant="inline"
              message={metrics.message}
              correlationId={metrics.correlationId}
            />
          )}
        </div>
        {latestSearch.ok ? (
          <SearchActivity data={latestSearch.data} />
        ) : (
          <UnavailableState
            message={latestSearch.message}
            correlationId={latestSearch.correlationId}
          />
        )}
      </section>
    </div>
  );
}
