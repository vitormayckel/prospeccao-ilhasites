import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PipelineCard } from "@/features/pipeline/components/pipeline-card";
import { pipelineStageLabel } from "@/features/opportunities/labels";
import { createServerContext } from "@/server/context";
import type { CompanyRow, PipelineStage } from "@/types/domain";

export const dynamic = "force-dynamic";

const COLUMNS: PipelineStage[] = [
  "approved",
  "first_contact",
  "follow_up",
  "negotiation",
  "client",
  "lost",
];

export default async function PipelinePage() {
  const { repositories } = await createServerContext();
  const companies = await repositories.pipeline.board();

  const byStage = new Map<PipelineStage, CompanyRow[]>();
  for (const stage of COLUMNS) byStage.set(stage, []);
  for (const c of companies) {
    byStage.get(c.pipeline_stage)?.push(c);
  }

  const isEmpty = companies.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pipeline"
        description="Acompanhe cada oportunidade do primeiro contato ao fechamento."
      />

      {isEmpty ? (
        <EmptyState
          icon={KanbanSquare}
          title="Pipeline vazio"
          description="Aprove empresas na fila de oportunidades para vê-las aqui."
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((stage) => {
            const items = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="w-72 shrink-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-text-primary">
                    {pipelineStageLabel[stage]}
                  </h2>
                  <span className="tnum text-xs text-text-muted">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((c) => (
                    <PipelineCard key={c.id} company={c} />
                  ))}
                  {items.length === 0 ? (
                    <div className="rounded-control border border-dashed border-border-subtle px-3 py-6 text-center text-xs text-text-muted">
                      Vazio
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
