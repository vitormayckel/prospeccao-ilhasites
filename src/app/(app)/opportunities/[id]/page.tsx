import Link from "next/link";
import { ArrowLeft, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function OpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/opportunities">
          <ArrowLeft />
          Voltar para oportunidades
        </Link>
      </Button>

      <EmptyState
        icon={FileSearch}
        title={`Detalhe da empresa #${params.id}`}
        description="A página detalhada com dados, fontes, análise e histórico será construída na Fase 2."
      />
    </div>
  );
}
