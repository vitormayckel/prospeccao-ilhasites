import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { LatestSearch } from "@/server/repositories/dashboard-repository";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

const statusVariant: Record<string, BadgeProps["variant"]> = {
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Atividade da busca</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle py-0">
        {!data ? (
          <EmptyState
            title="Sem buscas ainda"
            description="Execuções de pesquisa aparecerão aqui."
            className="border-none py-10"
          />
        ) : (
          <>
            <div className="flex items-center justify-between py-4">
              <span className="text-sm text-text-secondary">
                Novas empresas
              </span>
              <span className="tnum text-2xl font-semibold tracking-tight text-text-primary">
                {data.new_companies}
              </span>
            </div>
            <Row label="Cidade">
              <span className="text-text-primary">{data.city ?? "—"}</span>
            </Row>
            <Row label="Perfil">
              <span className="truncate text-text-primary">
                {data.profile_name ?? "—"}
              </span>
            </Row>
            <Row label="Status">
              <Badge variant={statusVariant[data.status] ?? "neutral"}>
                {statusLabel[data.status] ?? data.status}
              </Badge>
            </Row>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { SearchActivity };
