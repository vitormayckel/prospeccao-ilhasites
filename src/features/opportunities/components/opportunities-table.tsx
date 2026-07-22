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
  commercialPriorityVariant,
  reviewStatusLabel,
  reviewStatusTone,
  analysisStateLabel,
  analysisStateTone,
} from "@/features/opportunities/labels";
import { WEBSITE_CLASS_TO_PRIORITY } from "@/types/domain";
import type { CompanyListRow } from "@/server/repositories/companies-repository";

/**
 * Prioridade comercial (A/B/C/D) derivada da classe do site. É o rótulo
 * explicativo ao lado do commercial_score — não o critério de ordenação.
 */
function CommercialPriorityCell({ row }: { row: CompanyListRow }) {
  if (!row.website_class) {
    return <span className="text-text-muted">—</span>;
  }
  const priority = WEBSITE_CLASS_TO_PRIORITY[row.website_class];
  return <Badge variant={commercialPriorityVariant[priority]}>{priority}</Badge>;
}

export function OpportunitiesTable({ rows }: { rows: CompanyListRow[] }) {
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
            <TableHead className="w-28">Prioridade</TableHead>
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
                  {/* Score comercial (0–100): ranking primário da fila. */}
                  {row.commercial_score === null ? (
                    <span className="text-text-muted">—</span>
                  ) : (
                    <ScoreBadge score={row.commercial_score} />
                  )}
                </TableCell>
                <TableCell>
                  <CommercialPriorityCell row={row} />
                </TableCell>
                <TableCell>
                  {/* O estado fino da análise tem precedência: evita que um
                      registro travado apareça como "Em análise" para sempre. */}
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
                    <StatusDot
                      tone={
                        row.analysis_state
                          ? analysisStateTone[row.analysis_state]
                          : reviewStatusTone[row.review_status]
                      }
                    />
                    {row.analysis_state
                      ? analysisStateLabel[row.analysis_state]
                      : reviewStatusLabel[row.review_status]}
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
