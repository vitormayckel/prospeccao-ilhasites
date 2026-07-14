import { PageHeader } from "@/components/layout/page-header";
import { RunSearchDialog } from "@/features/opportunities/components/run-search-dialog";
import { OpportunitiesView } from "@/features/opportunities/components/opportunities-view";

export default function OpportunitiesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Oportunidades"
        description="Empresas encontradas, prontas para sua análise."
        actions={<RunSearchDialog />}
      />
      <OpportunitiesView />
    </div>
  );
}
