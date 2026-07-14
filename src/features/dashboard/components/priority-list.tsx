import { Clock, Send, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { priorities, type PriorityKind } from "@/features/dashboard/mock-data";

const kindConfig: Record<
  PriorityKind,
  { label: string; variant: BadgeProps["variant"]; icon: typeof Clock }
> = {
  follow_up: { label: "Follow-up", variant: "warning", icon: Clock },
  approach: { label: "Abordar", variant: "accent", icon: Send },
  review: { label: "Revisar", variant: "info", icon: Eye },
};

/** Lista curta de prioridades do dia. */
function PriorityList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prioridades de hoje</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border-subtle">
          {priorities.map((item) => {
            const config = kindConfig[item.kind];
            const Icon = config.icon;
            return (
              <li
                key={item.id}
                className="hover:bg-surface-2/40 flex items-center gap-3 px-5 py-3 transition-colors"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-text-muted">
                  <Icon className="size-4" />
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
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export { PriorityList };
