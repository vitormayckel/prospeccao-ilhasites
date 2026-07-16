import Link from "next/link";
import { MessageSquare, LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createServerContext } from "@/server/context";
import type { MessageStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

/*
 * Mensagem que ainda pede ação (preparada, agendada, falhou) recebe cor cheia;
 * enviada é um estado resolvido e fica discreto. É o que separa esta tela de
 * uma tabela de logs: o que falta fazer salta primeiro.
 */
const statusMeta: Record<
  MessageStatus,
  {
    label: string;
    variant: BadgeProps["variant"];
    tone: BadgeProps["tone"];
    needsAction: boolean;
  }
> = {
  draft: {
    label: "Preparada",
    variant: "warning",
    tone: "soft",
    needsAction: true,
  },
  opened: {
    label: "Agendada",
    variant: "info",
    tone: "soft",
    needsAction: true,
  },
  confirmed_sent: {
    label: "Enviada",
    variant: "success",
    tone: "quiet",
    needsAction: false,
  },
  not_sent: {
    label: "Falhou",
    variant: "danger",
    tone: "soft",
    needsAction: true,
  },
};

export default async function MessagesPage() {
  const { repositories } = await createServerContext();
  const messages = await repositories.messages.listRecent();
  const pending = messages.filter((m) => statusMeta[m.status].needsAction);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Central de abordagens"
        title="Mensagens"
        description="Histórico de abordagens confirmadas e preparadas."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/messages/templates">
              <LibraryBig />
              Templates
            </Link>
          </Button>
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Sem mensagens ainda"
          description="Mensagens preparadas e confirmadas aparecerão aqui."
        />
      ) : (
        <div className="space-y-4">
          {/* Responde de imediato "o que ainda precisa de mim?". */}
          <p className="text-meta text-text-secondary">
            {pending.length > 0 ? (
              <>
                <span className="tnum font-medium text-text-primary">
                  {pending.length}
                </span>{" "}
                {pending.length === 1
                  ? "mensagem aguarda ação"
                  : "mensagens aguardam ação"}
                <span className="text-text-muted">
                  {" "}
                  · {messages.length} no total
                </span>
              </>
            ) : (
              <span className="text-text-muted">
                Nenhuma mensagem pendente · {messages.length} no total
              </span>
            )}
          </p>

          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-44">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => {
                  const meta = statusMeta[m.status];
                  return (
                    <TableRow key={m.id} className="group">
                      <TableCell>
                        <Link
                          href={`/opportunities/${m.company_id}`}
                          className="block max-w-[48ch] truncate text-body font-semibold tracking-[-0.01em] text-text-primary outline-none transition-colors hover:text-accent focus-visible:text-accent"
                        >
                          {m.company_name}
                        </Link>
                        {/* A prévia é citada, não listada: a régua à esquerda faz
                         * a linha ler como mensagem em vez de célula de log. */}
                        <p className="group-hover:border-accent/40 mt-1.5 line-clamp-1 max-w-[86ch] border-l border-border pl-2.5 text-micro leading-relaxed text-text-muted transition-colors">
                          {m.content}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} tone={meta.tone}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-micro text-text-muted">
                        {formatDateTime(m.sent_at ?? m.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
