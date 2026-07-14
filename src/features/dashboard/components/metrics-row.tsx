import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MonthlyMetrics } from "@/server/repositories/dashboard-repository";

/** Faixa de métricas dos últimos 30 dias. */
function MetricsRow({ metrics }: { metrics: MonthlyMetrics }) {
  const cells = [
    { id: "found", label: "Encontradas", value: String(metrics.found) },
    { id: "approached", label: "Abordadas", value: String(metrics.approached) },
    { id: "replies", label: "Mensagens", value: String(metrics.replies) },
    { id: "clients", label: "Clientes", value: String(metrics.clients) },
    {
      id: "conversion",
      label: "Conversão",
      value: `${(metrics.conversionRate * 100).toFixed(1).replace(".", ",")}%`,
      emphasis: true,
    },
  ];
  return (
    <Card className="divide-y divide-border-subtle sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
      {cells.map((metric) => (
        <div
          key={metric.id}
          className="hover:bg-surface-2/30 px-5 py-5 transition-colors"
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {metric.label}
          </p>
          <p
            className={cn(
              "tnum mt-2 text-2xl font-semibold tracking-tight",
              metric.emphasis ? "text-accent" : "text-text-primary",
            )}
          >
            {metric.value}
          </p>
        </div>
      ))}
    </Card>
  );
}

export { MetricsRow };
