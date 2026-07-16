import { PageHeader } from "@/components/layout/page-header";
import { OpportunitiesControls } from "@/features/opportunities/components/opportunities-controls";
import { OpportunitiesTable } from "@/features/opportunities/components/opportunities-table";
import { Pagination } from "@/features/opportunities/components/pagination";
import { AnalyzePendingButton } from "@/features/opportunities/components/analyze-pending-button";
import { createServerContext } from "@/server/context";
import { opportunityFiltersSchema } from "@/lib/validation/company";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const statusParam = single(searchParams.status);
  const validStatuses = ["pending_review", "approved", "snoozed", "rejected"];

  const parsed = opportunityFiltersSchema.safeParse({
    search: single(searchParams.search),
    city: single(searchParams.city),
    reviewStatus: validStatuses.includes(statusParam ?? "")
      ? statusParam
      : undefined,
    sort: single(searchParams.sort) ?? "priority",
    order: single(searchParams.order) ?? "desc",
    page: single(searchParams.page) ?? 1,
    pageSize: 20,
  });
  const filters = parsed.success
    ? parsed.data
    : opportunityFiltersSchema.parse({});

  const { repositories } = await createServerContext();
  const [result, pendingAnalysis] = await Promise.all([
    repositories.companies.list(filters),
    repositories.aiAnalyses.countPendingAnalysis(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fila de decisão"
        title="Oportunidades"
        description="Empresas encontradas, prontas para sua análise."
        actions={<AnalyzePendingButton pending={pendingAnalysis} />}
      />
      <div className="space-y-4">
        <OpportunitiesControls />
        <OpportunitiesTable rows={result.rows} />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
        />
      </div>
    </div>
  );
}
