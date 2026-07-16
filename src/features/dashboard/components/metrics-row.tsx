import { cn } from "@/lib/utils";
import type { MonthlyMetrics } from "@/server/repositories/dashboard-repository";

/*
 * Anexo da faixa de KPIs, não uma seção nova. Três recuos deliberados o mantêm
 * abaixo dos indicadores do dia: 26px contra 44px, texto secundário contra
 * primário, e superfície plana contra a faixa elevada logo acima.
 */
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
    <div>
      <p className="eyebrow mb-4">Últimos 30 dias</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((metric) => (
          <div key={metric.id} className="min-w-0">
            <p className="truncate text-micro text-text-muted">
              {metric.label}
            </p>
            <p
              className={cn(
                "tnum mt-1.5 text-kpi-sm",
                metric.emphasis ? "text-accent" : "text-text-secondary",
              )}
            >
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export { MetricsRow };
