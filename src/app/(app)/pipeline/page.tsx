import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function PipelinePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pipeline"
        description="Acompanhe cada oportunidade do primeiro contato ao fechamento."
      />
      <EmptyState
        icon={KanbanSquare}
        title="Kanban em construção"
        description="O quadro com os estágios do pipeline será implementado na Fase 6."
      />
    </div>
  );
}
