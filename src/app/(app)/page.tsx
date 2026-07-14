import { Inbox, Send, CalendarClock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  StatCard,
  type StatItem,
} from "@/features/dashboard/components/stat-card";
import { PriorityList } from "@/features/dashboard/components/priority-list";
import { SearchActivity } from "@/features/dashboard/components/search-activity";
import { MetricsRow } from "@/features/dashboard/components/metrics-row";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DashboardPage() {
  const { repositories } = await createServerContext();
  const [summary, priorities, latestSearch, metrics] = await Promise.all([
    repositories.dashboard.getSummary(),
    repositories.dashboard.getPriorities(),
    repositories.dashboard.getLatestSearch(),
    repositories.dashboard.getMonthlyMetrics(),
  ]);

  const stats: StatItem[] = [
    {
      id: "review",
      label: "Aguardando análise",
      value: String(summary.pendingReview),
      hint: "empresas",
      icon: Inbox,
      intent: "default",
    },
    {
      id: "messages",
      label: "Mensagens pendentes",
      value: String(summary.approvedAwaitingMessage),
      hint: "aprovadas",
      icon: Send,
      intent: "accent",
    },
    {
      id: "followups",
      label: "Follow-ups de hoje",
      value: String(summary.followUpsDueToday),
      hint: "agendados",
      icon: CalendarClock,
      intent: "default",
    },
    {
      id: "overdue",
      label: "Atrasados",
      value: String(summary.followUpsOverdue),
      hint: "follow-up",
      icon: AlertTriangle,
      intent: summary.followUpsOverdue > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={greeting()}
        description="Estas são as suas prioridades de hoje."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((item) => (
          <StatCard key={item.id} item={item} />
        ))}
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriorityList items={priorities} />
        </div>
        <SearchActivity data={latestSearch} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Resumo dos últimos 30 dias
        </h2>
        <MetricsRow metrics={metrics} />
      </section>
    </div>
  );
}
