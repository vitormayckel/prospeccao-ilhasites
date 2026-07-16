import Link from "next/link";
import { ArrowLeft, LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateTemplateDialog } from "@/features/messages/components/create-template-dialog";
import { DeleteTemplateButton } from "@/features/messages/components/delete-template-button";
import { createServerContext } from "@/server/context";
import type { MessageKind } from "@/types/domain";

export const dynamic = "force-dynamic";

const kindLabel: Record<MessageKind, string> = {
  first_contact: "Primeira abordagem",
  follow_up: "Follow-up",
  reactivation: "Reativação",
  last_attempt: "Última tentativa",
};

export default async function TemplatesPage() {
  const { repositories } = await createServerContext();
  const templates = await repositories.templates.list();

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
        actions={<CreateTemplateDialog />}
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title="Biblioteca vazia"
          description="Crie seu primeiro template para agilizar as abordagens."
        />
      ) : (
        <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle">
          {templates.map((t) => (
            <div
              key={t.id}
              className="hover:bg-surface-2/30 group flex items-start justify-between gap-4 px-5 py-4 transition-colors"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-text-primary">
                    {t.name}
                  </span>
                  <span className="text-micro text-text-muted">
                    {kindLabel[t.category]}
                  </span>
                  {t.is_default ? <Badge variant="accent">Padrão</Badge> : null}
                </div>
                <p className="line-clamp-2 max-w-[80ch] text-meta leading-relaxed text-text-secondary">
                  {t.content}
                </p>
                {t.allowed_variables.length > 0 ? (
                  <p className="font-mono text-micro text-text-muted">
                    {t.allowed_variables.join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <DeleteTemplateButton id={t.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
