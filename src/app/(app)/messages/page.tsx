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

const statusMeta: Record<
  MessageStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  draft: { label: "Rascunho", variant: "neutral" },
  opened: { label: "Aberta", variant: "info" },
  confirmed_sent: { label: "Enviada", variant: "success" },
  not_sent: { label: "Não enviada", variant: "warning" },
};

export default async function MessagesPage() {
  const { repositories } = await createServerContext();
  const messages = await repositories.messages.listRecent();

  return (
    <div className="space-y-8">
      <PageHeader
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
        <div className="overflow-hidden rounded-card border border-border-subtle">
          <Table>
            <TableHeader className="bg-surface-1/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Empresa</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => {
                const meta = statusMeta[m.status];
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-text-primary">
                      <Link
                        href={`/opportunities/${m.company_id}`}
                        className="hover:text-accent"
                      >
                        {m.company_name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <span className="line-clamp-1 text-text-secondary">
                        {m.content}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(m.sent_at ?? m.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
