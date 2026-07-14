import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { PriorityList } from "@/features/dashboard/components/priority-list";
import { SearchActivity } from "@/features/dashboard/components/search-activity";
import { MetricsRow } from "@/features/dashboard/components/metrics-row";
import { summaryStats } from "@/features/dashboard/mock-data";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Bom dia"
        description="Estas são as suas prioridades de hoje."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryStats.map((item) => (
          <StatCard key={item.id} item={item} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriorityList />
        </div>
        <SearchActivity />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">
          Resumo dos últimos 30 dias
        </h2>
        <MetricsRow />
      </section>
    </div>
  );
}
