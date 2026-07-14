import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { SearchAlert } from "@/server/repositories/dashboard-repository";

/** Alerta acionável de buscas com falha/parciais (Blueprint §10.5, RF-15). */
export function SearchAlerts({ alerts }: { alerts: SearchAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Card className="border-danger/30 bg-danger/[0.04]">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-danger">
          <AlertTriangle className="size-4" />
          Buscas que precisam de atenção
        </div>
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li
              key={a.run_id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="text-text-primary">
                  {a.profile_name ?? "Perfil removido"} ·{" "}
                  {a.status === "failed" ? "falhou" : "parcial"}
                </p>
                {a.error_message ? (
                  <p className="truncate text-xs text-text-muted">
                    {a.error_message}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-text-muted">
                {formatDateTime(a.finished_at)}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/settings/searches"
          className="inline-block text-xs text-accent hover:underline"
        >
          Ver perfis de busca
        </Link>
      </CardContent>
    </Card>
  );
}
