import Link from "next/link";
import { Clock, Send, Eye, ChevronRight } from "lucide-react";
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
    iconClass: "text-warning",
  },
  approach: {
    label: "Abordar",
    variant: "accent",
    icon: Send,
    iconClass: "text-accent",
  },
  review: {
    label: "Revisar",
    variant: "info",
    icon: Eye,
    iconClass: "text-info",
  },
};

/** Lista curta de prioridades do dia. */
function PriorityList({ items }: { items: PriorityItem[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Prioridades de hoje</CardTitle>
        <span className="tnum text-micro text-text-muted">
          {items.length} {items.length === 1 ? "item" : "itens"}
        </span>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {items.length === 0 ? (
          <EmptyState
            variant="inline"
            title="Tudo em dia"
            description="Sem prioridades pendentes no momento."
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-t border-border-subtle">
            {items.map((item, i) => {
              const config = kindConfig[item.kind];
              const Icon = config.icon;
              return (
                <li key={`${item.kind}-${item.company_id}-${i}`}>
                  <Link
                    href={`/opportunities/${item.company_id}`}
                    className="hover:bg-surface-2/50 focus-visible:bg-surface-2/50 group flex items-center gap-3 px-5 py-3 transition-colors focus-visible:outline-none"
                  >
                    {/* Ícone sem cápsula: o tipo se lê pela cor, não pelo peso. */}
                    <Icon
                      className={`size-4 shrink-0 ${config.iconClass}`}
                      strokeWidth={1.75}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-text-primary">
                        {item.company}
                      </p>
                      <p className="truncate text-micro text-text-muted">
                        {item.detail}
                      </p>
                    </div>
                    <Badge variant={config.variant} tone="quiet">
                      {config.label}
                    </Badge>
                    <ChevronRight className="size-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
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
