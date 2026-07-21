import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { History } from "lucide-react";
import { RunSearchButton } from "@/features/searches/components/run-search-button";
import { StartProspectButton } from "@/features/searches/components/start-prospect-button";
import { ProfileStatusToggle } from "@/features/searches/components/profile-status-toggle";
import { formatDateTime } from "@/lib/format";
import { createServerContext } from "@/server/context";
import type { SearchRunStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const RUN_STATUS: Record<
  SearchRunStatus,
  {
    label: string;
    variant: "success" | "warning" | "danger" | "neutral" | "info";
  }
> = {
  queued: { label: "Na fila", variant: "neutral" },
  running: { label: "Executando", variant: "info" },
  partial: { label: "Parcial", variant: "warning" },
  completed: { label: "Concluída", variant: "success" },
  failed: { label: "Falhou", variant: "danger" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

export default async function SearchProfileDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { repositories } = await createServerContext();
  const detail = await repositories.searchProfiles.getDetail(params.id);
  if (!detail) notFound();

  const { profile, locations, categories } = detail;
  const runs = await repositories.collection.listRunsByProfile(profile.id, 10);
  const activeCategories = categories.filter((c) => c.active);

  return (
    <div className="space-y-5">
      <Link
        href="/settings/searches"
        className="inline-flex items-center gap-1.5 text-meta text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Perfis de pesquisa
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <StatusDot
              tone={profile.status === "active" ? "success" : "neutral"}
            />
            <h2 className="text-title text-text-primary">{profile.name}</h2>
            <span className="text-micro text-text-muted">
              {profile.status === "active" ? "Ativo" : "Pausado"}
            </span>
          </div>
          <p className="text-meta text-text-secondary">
            Provedor: {profile.provider} · limite {profile.daily_limit}/dia ·{" "}
            {profile.run_time} ({profile.timezone})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProfileStatusToggle id={profile.id} status={profile.status} />
          {/* "Testar" continua sendo a coleta síncrona sem persistir — é
              diagnóstico do perfil. Iniciar a prospecção de verdade cria o
              job persistente. */}
          <RunSearchButton profileId={profile.id} mode="test" />
          <StartProspectButton
            profileId={profile.id}
            targetQualified={profile.daily_limit}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Localidades</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {locations.length === 0 ? (
              <span className="text-sm text-text-muted">
                Nenhuma localidade.
              </span>
            ) : (
              locations.map((l) => (
                <Badge key={l.id} variant="neutral">
                  {l.city} — {l.state}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias ({activeCategories.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {activeCategories.length === 0 ? (
              <span className="text-sm text-text-muted">
                Nenhuma categoria.
              </span>
            ) : (
              activeCategories.map((c) => (
                <Badge key={c.id} variant="neutral">
                  {c.label}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de execuções</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={History}
                title="Nenhuma execução"
                description='Use "Executar agora" para coletar empresas com este perfil.'
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Vistos</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Duplicadas</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const status = RUN_STATUS[run.status];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-text-secondary">
                        {formatDateTime(
                          run.finished_at ?? run.started_at ?? run.created_at,
                        )}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {run.trigger_type === "manual" ? "Manual" : "Agendada"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {run.error_message ? (
                          <span className="ml-2 text-xs text-danger">
                            {run.error_message}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.results_seen}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-text-primary">
                        {run.new_companies}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.duplicates}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.failed_items}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
