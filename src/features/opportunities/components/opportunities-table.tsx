import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { RowActions } from "@/features/opportunities/components/row-actions";
import {
  priorityLabel,
  priorityVariant,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/features/opportunities/labels";
import type { CompanyRow, Priority } from "@/types/domain";

/** Só prioridade acionável recebe cor; o resto é texto discreto. */
function PriorityCell({ priority }: { priority: Priority }) {
  if (priority === "high" || priority === "urgent") {
    return (
      <Badge variant={priorityVariant[priority]}>
        {priorityLabel[priority]}
      </Badge>
    );
  }
  return <span className="text-text-muted">{priorityLabel[priority]}</span>;
}

export function OpportunitiesTable({ rows }: { rows: CompanyRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhuma empresa encontrada"
        description="Ajuste os filtros ou aguarde a próxima busca para ver empresas aqui."
      />
    );
  }

  return (
    /* Superfície sólida: a tabela se destaca do fundo da página em vez de
     * flutuar sobre ele — é o que dá contraste sem pesar as bordas. */
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Empresa</TableHead>
            <TableHead className="w-24">Score</TableHead>
            <TableHead className="w-32">Prioridade</TableHead>
            <TableHead className="w-40">Estado</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            // Cidade e categoria descem para a linha de apoio: o nome fica
            // sozinho no topo da hierarquia e a tabela perde duas colunas.
            const subtitle =
              [row.city, row.primary_category].filter(Boolean).join(" · ") ||
              "—";
            return (
              <TableRow key={row.id} className="group">
                <TableCell>
                  {/* O nome é o único elemento em peso semibold da linha; tudo
                   * o mais desce para micro/muted. */}
                  <Link
                    href={`/opportunities/${row.id}`}
                    className="block max-w-[48ch] truncate text-body font-semibold tracking-[-0.01em] text-text-primary outline-none transition-colors hover:text-accent focus-visible:text-accent"
                  >
                    {row.name}
                  </Link>
                  <p className="mt-1 max-w-[48ch] truncate text-micro text-text-muted">
                    {subtitle}
                  </p>
                </TableCell>
                <TableCell>
                  {row.score === null ? (
                    <span className="text-text-muted">—</span>
                  ) : (
                    <ScoreBadge score={row.score} />
                  )}
                </TableCell>
                <TableCell>
                  <PriorityCell priority={row.priority} />
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
                    <StatusDot tone={reviewStatusTone[row.review_status]} />
                    {reviewStatusLabel[row.review_status]}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <RowActions
                      companyId={row.id}
                      reviewStatus={row.review_status}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
