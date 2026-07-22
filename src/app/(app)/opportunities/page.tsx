import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { OpportunitiesControls } from "@/features/opportunities/components/opportunities-controls";
import { OpportunitiesTable } from "@/features/opportunities/components/opportunities-table";
import { Pagination } from "@/features/opportunities/components/pagination";
import { AnalyzePendingButton } from "@/features/opportunities/components/analyze-pending-button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { createServerContext } from "@/server/context";
import { safeQuery } from "@/server/safe-query";
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
    sort: single(searchParams.sort) ?? "commercial",
    order: single(searchParams.order) ?? "desc",
    page: single(searchParams.page) ?? 1,
    pageSize: 20,
  });
  const filters = parsed.success
    ? parsed.data
    : opportunityFiltersSchema.parse({});

  const header = (actions?: ReactNode) => (
    <PageHeader
      eyebrow="Fila de decisão"
      title="Oportunidades"
      description="Empresas encontradas, prontas para sua análise."
      actions={actions}
    />
  );

  // A fila de decisão precisa continuar acessível mesmo com o banco sob
  // pressão ou com um job em erro — leitura isolada do processamento.
  const context = await safeQuery("opportunities.context", createServerContext);
  if (!context.ok) {
    return (
      <div className="space-y-8">
        {header()}
        <UnavailableState
          message={context.message}
          correlationId={context.correlationId}
        />
      </div>
    );
  }

  const { repositories } = context.data;
  const [result, pendingAnalysis] = await Promise.all([
    safeQuery("opportunities.list", () => repositories.companies.list(filters)),
    // Contador acessório: se falhar, o botão apenas não aparece. Não pode
    // impedir a fila de renderizar.
    safeQuery("opportunities.pendingCount", () =>
      repositories.aiAnalyses.countPendingAnalysis(),
    ),
  ]);

  return (
    <div className="space-y-8">
      {header(
        pendingAnalysis.ok ? (
          <AnalyzePendingButton pending={pendingAnalysis.data} />
        ) : null,
      )}
      <div className="space-y-4">
        <OpportunitiesControls />
        {result.ok ? (
          <>
            <OpportunitiesTable rows={result.data.rows} />
            <Pagination
              page={result.data.page}
              pageCount={result.data.pageCount}
              total={result.data.total}
            />
          </>
        ) : (
          <UnavailableState
            message={result.message}
            correlationId={result.correlationId}
          />
        )}
      </div>
    </div>
  );
}
