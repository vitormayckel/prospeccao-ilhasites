import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { SearchAlert } from "@/server/repositories/dashboard-repository";

/** Alerta acionável de buscas com falha/parciais (Blueprint §10.5, RF-15). */
export function SearchAlerts({ alerts }: { alerts: SearchAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    /*
     * O alerta se destaca por uma régua vermelha e um fundo quase imperceptível,
     * não por um bloco vermelho: chama atenção sem dominar o dashboard.
     */
    <Card
      variant="flush"
      className="border-l-danger/60 bg-danger/[0.03] border-l-2 px-5 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-meta font-medium text-danger">
          <AlertTriangle className="size-3.5" strokeWidth={2} />
          Buscas que precisam de atenção
        </div>
        <Link
          href="/settings/searches"
          className="shrink-0 text-micro text-text-secondary transition-colors hover:text-accent"
        >
          Ver perfis
        </Link>
      </div>
      <ul className="mt-3 space-y-1.5">
        {alerts.map((a) => (
          <li
            key={a.run_id}
            className="flex items-start justify-between gap-3 text-meta"
          >
            <div className="min-w-0">
              <p className="text-text-primary">
                {a.profile_name ?? "Perfil removido"}{" "}
                <span className="text-text-muted">
                  · {a.status === "failed" ? "falhou" : "parcial"}
                </span>
              </p>
              {a.error_message ? (
                <p className="truncate text-micro text-text-muted">
                  {a.error_message}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-micro text-text-muted">
              {formatDateTime(a.finished_at)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
