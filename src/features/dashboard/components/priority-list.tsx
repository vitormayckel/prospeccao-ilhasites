import Link from "next/link";
import { Clock, Send, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  PriorityItem,
  PriorityKind,
} from "@/server/repositories/dashboard-repository";

const kindConfig: Record<
  PriorityKind,
  {
    label: string;
    variant: BadgeProps["variant"];
    icon: typeof Clock;
    iconClass: string;
  }
> = {
  follow_up: {
    label: "Follow-up",
    variant: "warning",
    icon: Clock,
    iconClass: "bg-warning/12 text-warning",
  },
  approach: {
    label: "Abordar",
    variant: "accent",
    icon: Send,
    iconClass: "bg-accent-soft text-accent",
  },
  review: {
    label: "Revisar",
    variant: "info",
    icon: Eye,
    iconClass: "bg-info/12 text-info",
  },
};

/** Lista curta de prioridades do dia. */
function PriorityList({ items }: { items: PriorityItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Prioridades de hoje</CardTitle>
        <span className="tnum text-xs text-text-muted">
          {items.length} itens
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              title="Tudo em dia"
              description="Sem prioridades pendentes no momento."
              className="border-none py-10"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((item, i) => {
              const config = kindConfig[item.kind];
              const Icon = config.icon;
              return (
                <li key={`${item.kind}-${item.company_id}-${i}`}>
                  <Link
                    href={`/opportunities/${item.company_id}`}
                    className="hover:bg-surface-2/40 flex items-center gap-3.5 px-5 py-3.5 transition-colors"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-control ${config.iconClass}`}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {item.company}
                      </p>
                      <p className="truncate text-xs text-text-secondary">
                        {item.detail}
                      </p>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { PriorityList };
