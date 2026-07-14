import { MoreHorizontal, Building2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import {
  priorityLabel,
  statusLabel,
  type OpportunityRow,
  type Priority,
} from "@/features/opportunities/mock-data";

const priorityVariant: Record<Priority, BadgeProps["variant"]> = {
  low: "neutral",
  normal: "outline",
  high: "warning",
  urgent: "danger",
};

function OpportunitiesTable({ rows }: { rows: OpportunityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhuma empresa nesta aba"
        description="Quando houver empresas neste estado, elas aparecerão aqui."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle">
      <Table>
        <TableHeader>
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
            <TableRow key={row.id}>
              <TableCell className="font-medium text-text-primary">
                {row.name}
              </TableCell>
              <TableCell>{row.city}</TableCell>
              <TableCell>{row.category}</TableCell>
              <TableCell>
                <ScoreBadge score={row.score} />
              </TableCell>
              <TableCell>
                <Badge variant={priorityVariant[row.priority]}>
                  {priorityLabel[row.priority]}
                </Badge>
              </TableCell>
              <TableCell>{statusLabel[row.status]}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ações"
                      className="focus-visible:ring-accent/40 flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                    <DropdownMenuItem>Aprovar</DropdownMenuItem>
                    <DropdownMenuItem>Adiar</DropdownMenuItem>
                    <DropdownMenuItem>Rejeitar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { OpportunitiesTable };
