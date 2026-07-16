import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import type { LatestSearch } from "@/server/repositories/dashboard-repository";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-meta">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 truncate text-text-primary">{children}</span>
    </div>
  );
}

const statusTone: Record<string, StatusTone> = {
  completed: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  queued: "neutral",
  cancelled: "neutral",
};

const statusLabel: Record<string, string> = {
  completed: "concluída",
  partial: "parcial",
  failed: "falhou",
  running: "em execução",
  queued: "na fila",
  cancelled: "cancelada",
};

/** Resumo da última execução de busca. */
function SearchActivity({ data }: { data: LatestSearch | null }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Atividade da busca</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {!data ? (
          <EmptyState
            variant="inline"
            title="Sem buscas ainda"
            description="Execuções de pesquisa aparecerão aqui."
          />
        ) : (
          <>
            {/* O resultado da busca é o número; o resto é procedência. Em
             * escala menor que os KPIs do dia — este bloco é nível 3. */}
            <div className="pb-4">
              <p className="eyebrow">Novas empresas</p>
              <p className="tnum mt-2.5 text-kpi-sm text-text-primary">
                {data.new_companies}
              </p>
            </div>
            <div className="divide-y divide-border-subtle border-t border-border-subtle">
              <Row label="Cidade">{data.city ?? "—"}</Row>
              <Row label="Perfil">{data.profile_name ?? "—"}</Row>
              <Row label="Status">
                <span className="inline-flex items-center gap-2">
                  <StatusDot tone={statusTone[data.status] ?? "neutral"} />
                  {statusLabel[data.status] ?? data.status}
                </span>
              </Row>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { SearchActivity };
