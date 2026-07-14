import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatIntent = "default" | "accent" | "danger";

export interface StatItem {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  intent: StatIntent;
}

const iconIntent: Record<StatIntent, string> = {
  default: "bg-surface-2 text-text-secondary",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger/12 text-danger",
};

const valueIntent: Record<StatIntent, string> = {
  default: "text-text-primary",
  accent: "text-text-primary",
  danger: "text-danger",
};

/** Cartão de indicador (KPI) do topo do dashboard. */
function StatCard({ item }: { item: StatItem }) {
  const Icon = item.icon;
  return (
    <Card className="group p-5 transition-colors hover:border-border">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {item.label}
        </p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-control transition-colors",
            iconIntent[item.intent],
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span
          className={cn(
            "tnum text-3xl font-semibold leading-none tracking-tight",
            valueIntent[item.intent],
          )}
        >
          {item.value}
        </span>
        <span className="text-xs text-text-secondary">{item.hint}</span>
      </div>
    </Card>
  );
}

export { StatCard };
