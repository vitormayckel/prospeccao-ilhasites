import { Card } from "@/components/ui/card";
import type { StatItem } from "@/features/dashboard/mock-data";

/** Cartão de indicador do topo do dashboard. */
function StatCard({ item }: { item: StatItem }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {item.label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold text-text-primary">
          {item.value}
        </span>
        <span className="text-xs text-text-secondary">{item.hint}</span>
      </div>
    </Card>
  );
}

export { StatCard };
