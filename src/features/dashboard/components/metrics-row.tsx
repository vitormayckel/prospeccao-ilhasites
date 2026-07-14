import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { monthlyMetrics } from "@/features/dashboard/mock-data";

/** Faixa de métricas dos últimos 30 dias. */
function MetricsRow() {
  return (
    <Card className="divide-y divide-border-subtle sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
      {monthlyMetrics.map((metric) => (
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
