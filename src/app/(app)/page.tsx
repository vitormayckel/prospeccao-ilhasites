import { PageHeader } from "@/components/layout/page-header";
import { SectionLabel } from "@/components/ui/section-label";
import { QueueSummaryStrip } from "@/features/dashboard/components/queue-summary";
import { TodayQueue } from "@/features/dashboard/components/today-queue";
import { SearchActivity } from "@/features/dashboard/components/search-activity";
import { MetricsRow } from "@/features/dashboard/components/metrics-row";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

function greeting(): string {
  // Fuso America/Sao_Paulo — coerente com a Fila de Hoje.
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DashboardPage() {
  const { repositories } = await createServerContext();
  const [queueSummary, queue, latestSearch, metrics] = await Promise.all([
    repositories.dashboard.getQueueSummary(),
    repositories.dashboard.getTodayQueue(),
    repositories.dashboard.getLatestSearch(),
    repositories.dashboard.getMonthlyMetrics(),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Visão geral"
        title={greeting()}
        description="Sua fila de hoje, em ordem de prioridade."
      />

      <QueueSummaryStrip summary={queueSummary} />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Fila de hoje</SectionLabel>
          {queue.length > 0 ? (
            <span className="text-micro text-text-muted">
              <span className="tnum font-medium text-text-secondary">
                {queue.length}
              </span>{" "}
              {queue.length === 1 ? "tarefa" : "tarefas"}
            </span>
          ) : null}
        </div>
        <TodayQueue items={queue} />
      </section>

      <section className="grid items-stretch gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-card border border-border-subtle bg-surface-1/40 p-6">
          <MetricsRow metrics={metrics} />
        </div>
        <SearchActivity data={latestSearch} />
      </section>
    </div>
  );
}
