import { Card } from "@/components/ui/card";
import { monthlyMetrics } from "@/features/dashboard/mock-data";

/** Faixa de métricas dos últimos 30 dias. */
function MetricsRow() {
  return (
    <Card className="divide-y divide-border-subtle sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
      {monthlyMetrics.map((metric) => (
        <div key={metric.id} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {metric.label}
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-text-primary">
            {metric.value}
          </p>
        </div>
      ))}
    </Card>
  );
}

export { MetricsRow };
