import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TemplateDialog } from "@/features/messages/components/template-dialog";
import { TemplateActiveToggle } from "@/features/messages/components/template-active-toggle";
import { DeleteTemplateButton } from "@/features/messages/components/delete-template-button";
import { createServerContext } from "@/server/context";
import {
  MESSAGE_KIND_ORDER,
  MESSAGE_KIND_LABEL,
  MESSAGE_KIND_HELP,
} from "@/lib/message-kind";
import type { MessageKind, MessageTemplateRow } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { repositories } = await createServerContext();
  const templates = await repositories.templates.list();

  const byCategory = new Map<MessageKind, MessageTemplateRow[]>();
  for (const k of MESSAGE_KIND_ORDER) byCategory.set(k, []);
  for (const t of templates) byCategory.get(t.category)?.push(t);

  const activeCount = templates.filter((t) => t.active).length;

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
        description="Biblioteca de mensagens por etapa do contato. A saudação inicial abre a conversa; as demais só entram depois que o lead responde."
        actions={<TemplateDialog />}
      />

      <p className="text-meta text-text-secondary">
        <span className="tnum font-medium text-text-primary">{activeCount}</span>{" "}
        {activeCount === 1 ? "template ativo" : "templates ativos"}
        <span className="text-text-muted"> · {templates.length} no total</span>
      </p>

      <div className="space-y-10">
        {MESSAGE_KIND_ORDER.map((category) => {
          const items = byCategory.get(category) ?? [];
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-label text-text-primary">
                      {MESSAGE_KIND_LABEL[category]}
                    </h2>
                    {category === "greeting" ? (
                      <Badge variant="accent" tone="quiet">
                        padrão do 1º contato
                      </Badge>
                    ) : null}
                    <span className="tnum text-micro text-text-muted">
                      {items.length}
                    </span>
                  </div>
                  <p className="max-w-[80ch] text-micro text-text-muted">
                    {MESSAGE_KIND_HELP[category]}
                  </p>
                </div>
                <div className="shrink-0">
                  <TemplateDialog defaultCategory={category} />
                </div>
              </div>

              {items.length === 0 ? (
                <p className="px-1 py-2 text-meta text-text-muted">
                  Nenhum template nesta categoria.
                </p>
              ) : (
                <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2/30"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-medium text-text-primary">
                            {t.name}
                          </span>
                          {t.is_default ? (
                            <Badge variant="accent">Padrão</Badge>
                          ) : null}
                          {!t.active ? (
                            <Badge variant="neutral" tone="soft">
                              Inativo
                            </Badge>
                          ) : null}
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
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <TemplateActiveToggle id={t.id} active={t.active} />
                        <TemplateDialog template={t} />
                        <DeleteTemplateButton id={t.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
