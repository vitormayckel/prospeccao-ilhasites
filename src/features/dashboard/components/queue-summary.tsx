import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { QueueSummary } from "@/server/repositories/dashboard-repository";

type Tone = "default" | "accent" | "danger";

/** Resumo compacto do dia (§4). Reorganiza os KPIs em torno da operação de
 *  contato — sem duplicar os indicadores de 30 dias. */
export function QueueSummaryStrip({ summary }: { summary: QueueSummary }) {
  const items: { label: string; value: number; tone: Tone }[] = [
    { label: "Para abordar", value: summary.toApproach, tone: "default" },
    { label: "Aguardando resposta", value: summary.awaitingReply, tone: "default" },
    {
      label: "Responderam",
      value: summary.replied,
      tone: summary.replied > 0 ? "accent" : "default",
    },
    { label: "Follow-ups hoje", value: summary.followUpsToday, tone: "default" },
    {
      label: "Atrasados",
      value: summary.overdue,
      tone: summary.overdue > 0 ? "danger" : "default",
    },
    { label: "Revisões pendentes", value: summary.reviewPending, tone: "default" },
  ];

  const valueTone: Record<Tone, string> = {
    default: "text-text-primary",
    accent: "text-accent",
    danger: "text-danger",
  };

  return (
    <Card className="relative overflow-hidden shadow-raise">
      <span aria-hidden className="bg-accent/40 absolute inset-x-0 top-0 h-px" />
      <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="bg-surface-1 px-4 py-3.5">
            <p className="eyebrow truncate">{item.label}</p>
            <p className={cn("tnum mt-2 text-heading", valueTone[item.tone])}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
