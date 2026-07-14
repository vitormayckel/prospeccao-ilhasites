import Link from "next/link";
import { MessageSquare, LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function MessagesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mensagens"
        description="Histórico de abordagens e ações pendentes de envio."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/messages/templates">
              <LibraryBig />
              Templates
            </Link>
          </Button>
        }
      />
      <EmptyState
        icon={MessageSquare}
        title="Sem mensagens ainda"
        description="O compositor e o histórico de mensagens chegam na Fase 5."
      />
    </div>
  );
}
