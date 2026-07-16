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

const valueIntent: Record<StatIntent, string> = {
  default: "text-text-primary",
  accent: "text-accent",
  danger: "text-danger",
};

/*
 * O bloco dominante da tela. Quatro coisas o elevam acima do resto do
 * dashboard, todas de composição — nenhuma de família tipográfica:
 * numeral de 44px com tracking fechado (o maior corpo do produto),
 * superfície com sombra (as demais seções são planas), fio dourado no topo
 * e respiro interno maior que o de qualquer outro bloco.
 * Uma faixa dividida por fios — não quatro cartões soltos — porque os
 * indicadores do dia se leem juntos.
 */
function StatRow({ items }: { items: StatItem[] }) {
  return (
    <Card className="relative overflow-hidden shadow-raise">
      {/* Fio dourado sólido de 1px — assinatura, não gradiente decorativo. */}
      <span
        aria-hidden
        className="bg-accent/40 absolute inset-x-0 top-0 h-px"
      />
      <div className="grid grid-cols-1 gap-px bg-border-subtle sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="hover:bg-surface-2/40 group relative bg-surface-1 px-6 pb-6 pt-7 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    item.intent === "danger"
                      ? "text-danger"
                      : "text-text-muted",
                  )}
                  strokeWidth={1.75}
                />
                <p className="eyebrow truncate">{item.label}</p>
              </div>
              <p className={cn("tnum mt-5 text-kpi", valueIntent[item.intent])}>
                {item.value}
              </p>
              <p className="mt-3 text-micro text-text-muted">{item.hint}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export { StatRow };
