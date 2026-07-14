import Link from "next/link";
import { ArrowLeft, LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function TemplatesPage() {
  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/messages">
          <ArrowLeft />
          Voltar para mensagens
        </Link>
      </Button>
      <PageHeader
        title="Templates"
        description="Biblioteca de mensagens por categoria."
      />
      <EmptyState
        icon={LibraryBig}
        title="Biblioteca vazia"
        description="O gerenciamento de templates e variáveis será construído na Fase 5."
      />
    </div>
  );
}
