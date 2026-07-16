import { Inbox, Send, CalendarClock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  StatRow,
  type StatItem,
} from "@/features/dashboard/components/stat-card";
import { SectionLabel } from "@/components/ui/section-label";
import { PriorityList } from "@/features/dashboard/components/priority-list";
import { SearchActivity } from "@/features/dashboard/components/search-activity";
import { SearchAlerts } from "@/features/dashboard/components/search-alerts";
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
  const [summary, priorities, latestSearch, metrics, searchAlerts] =
    await Promise.all([
      repositories.dashboard.getSummary(),
      repositories.dashboard.getPriorities(),
      repositories.dashboard.getLatestSearch(),
      repositories.dashboard.getMonthlyMetrics(),
      repositories.dashboard.getSearchAlerts(),
    ]);

  const stats: StatItem[] = [
    {
      id: "review",
      label: "Aguardando revisão",
      value: String(summary.pendingReview),
      hint:
        summary.pendingAnalysis > 0
          ? `+${summary.pendingAnalysis} em análise IA`
          : "empresas",
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
    /*
     * Hierarquia em três níveis, do mais alto ao mais baixo:
     * 1. KPIs do dia — superfície elevada, numeral de 44px, fio dourado.
     * 2. Últimos 30 dias — anexo dos KPIs: sem moldura e a 26px. Fica colado
     *    à faixa acima porque contextualiza aqueles números.
     * 3. Alertas, prioridades e atividade — blocos planos de trabalho.
     */
    <div className="space-y-10">
      <PageHeader
        eyebrow="Visão geral"
        title={greeting()}
        description="Estas são as suas prioridades de hoje."
      />

      <section className="space-y-6">
        <StatRow items={stats} />
        <div className="px-1">
          <MetricsRow metrics={metrics} />
        </div>
      </section>

      <SearchAlerts alerts={searchAlerts} />

      <section className="space-y-5">
        <SectionLabel>Fila de trabalho</SectionLabel>
        <div className="grid items-stretch gap-5 lg:grid-cols-[1.5fr_1fr]">
          <PriorityList items={priorities} />
          <SearchActivity data={latestSearch} />
        </div>
      </section>
    </div>
  );
}
