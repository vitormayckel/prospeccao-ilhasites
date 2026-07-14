import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { searchActivity } from "@/features/dashboard/mock-data";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

/** Resumo da última execução de busca. */
function SearchActivity() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Atividade da busca</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle py-0">
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-text-secondary">Encontradas hoje</span>
          <span className="tnum text-2xl font-semibold tracking-tight text-text-primary">
            {searchActivity.found}
          </span>
        </div>
        <Row label="Cidade">
          <span className="text-text-primary">{searchActivity.city}</span>
        </Row>
        <Row label="Última execução">
          <span className="tnum text-text-primary">
            {searchActivity.lastRun}
          </span>
        </Row>
        <Row label="Status">
          <Badge variant="success">
            <span className="size-1.5 rounded-full bg-success" />
            {searchActivity.status}
          </Badge>
        </Row>
      </CardContent>
    </Card>
  );
}

export { SearchActivity };
