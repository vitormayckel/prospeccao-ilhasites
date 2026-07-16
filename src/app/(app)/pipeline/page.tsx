import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { StatusTone } from "@/components/ui/status-dot";
import { PipelineCard } from "@/features/pipeline/components/pipeline-card";
import {
  pipelineStageLabel,
  pipelineStageTone,
} from "@/features/opportunities/labels";
import { createServerContext } from "@/server/context";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/types/domain";
import type { PipelineBoardRow } from "@/server/repositories/pipeline-repository";

export const dynamic = "force-dynamic";

const COLUMNS: PipelineStage[] = [
  "approved",
  "first_contact",
  "follow_up",
  "negotiation",
  "client",
  "lost",
];

/*
 * Fio de identidade no topo de cada coluna. É o que impede o quadro de ler
 * como seis colunas idênticas: a cor progride de neutro (entrada) a dourado
 * (negociação) e fecha em verde (cliente).
 */
const stageRule: Record<StatusTone, string> = {
  neutral: "bg-text-muted/25",
  info: "bg-info/60",
  warning: "bg-warning/60",
  accent: "bg-accent/70",
  success: "bg-success/60",
  danger: "bg-danger/60",
};

export default async function PipelinePage() {
  const { repositories } = await createServerContext();
  const companies = await repositories.pipeline.board();

  const byStage = new Map<PipelineStage, PipelineBoardRow[]>();
  for (const stage of COLUMNS) byStage.set(stage, []);
  for (const c of companies) {
    byStage.get(c.pipeline_stage)?.push(c);
  }

  const isEmpty = companies.length === 0;
  const active = companies.filter(
    (c) => c.pipeline_stage !== "client" && c.pipeline_stage !== "lost",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Funil comercial"
        title="Pipeline"
        description="Acompanhe cada oportunidade do primeiro contato ao fechamento."
        actions={
          !isEmpty ? (
            <p className="text-meta text-text-muted">
              <span className="tnum font-medium text-text-primary">
                {active}
              </span>{" "}
              {active === 1 ? "oportunidade ativa" : "oportunidades ativas"}
            </p>
          ) : null
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={KanbanSquare}
          title="Pipeline vazio"
          description="Aprove empresas na fila de oportunidades para vê-las aqui."
        />
      ) : (
        /*
         * A profundidade é o que tira o quadro do "Trello": a coluna é um vão
         * escavado (mais escuro que o fundo da página) e os cards flutuam
         * acima dela com sombra. Antes, coluna e card viviam no mesmo plano.
         */
        <div className="flex min-h-[30rem] gap-3 overflow-x-auto pb-1 lg:h-[calc(100vh-15rem)]">
          {COLUMNS.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const tone = pipelineStageTone[stage];
            const muted = stage === "lost";
            return (
              <section
                key={stage}
                /* "Perdido" se apaga pelo fio neutro e pelo rótulo muted — não
                 * por opacidade, que arrastaria o texto dos cards abaixo do AA. */
                className={cn(
                  "flex min-w-[11.5rem] flex-1 flex-col overflow-hidden rounded-card",
                  "border-border-subtle/70 bg-surface-deep/40 border",
                )}
                aria-label={pipelineStageLabel[stage]}
              >
                <header className="relative shrink-0 px-3 pb-3 pt-4">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-0 h-[2px]",
                      stageRule[tone],
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <h2
                      className={cn(
                        "min-w-0 truncate text-label",
                        muted ? "text-text-muted" : "text-text-secondary",
                      )}
                    >
                      {pipelineStageLabel[stage]}
                    </h2>
                    <span className="tnum ml-auto shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-center text-[10px] font-medium leading-4 text-text-secondary">
                      {items.length}
                    </span>
                  </div>
                </header>

                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2.5">
                  {items.map((c) => (
                    <PipelineCard key={c.id} company={c} />
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1 pt-1 text-micro text-text-muted">
                      Nenhuma empresa
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
