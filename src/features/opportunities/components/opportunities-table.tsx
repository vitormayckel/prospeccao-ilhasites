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
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { RowActions } from "@/features/opportunities/components/row-actions";
import {
  priorityLabel,
  priorityVariant,
  reviewStatusLabel,
  reviewStatusDot,
} from "@/features/opportunities/labels";
import type { CompanyRow } from "@/types/domain";

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
    <div className="overflow-hidden rounded-card border border-border-subtle">
      <Table>
        <TableHeader className="bg-surface-1/40">
          <TableRow className="hover:bg-transparent">
            <TableHead>Empresa</TableHead>
            <TableHead>Cidade</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="group">
              <TableCell className="font-medium text-text-primary">
                <Link
                  href={`/opportunities/${row.id}`}
                  className="hover:text-accent"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell>{row.city ?? "—"}</TableCell>
              <TableCell>{row.primary_category ?? "—"}</TableCell>
              <TableCell>
                {row.score === null ? (
                  <span className="text-text-muted">—</span>
                ) : (
                  <ScoreBadge score={row.score} />
                )}
              </TableCell>
              <TableCell>
                <Badge variant={priorityVariant[row.priority]}>
                  {priorityLabel[row.priority]}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2 text-text-secondary">
                  <span
                    className={`size-1.5 rounded-full ${reviewStatusDot[row.review_status]}`}
                  />
                  {reviewStatusLabel[row.review_status]}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  companyId={row.id}
                  reviewStatus={row.review_status}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
