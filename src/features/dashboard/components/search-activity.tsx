import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { searchActivity } from "@/features/dashboard/mock-data";

/** Resumo da última execução de busca. */
function SearchActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade da busca</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Cidade</span>
          <span className="text-text-primary">{searchActivity.city}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Encontradas</span>
          <span className="font-mono text-text-primary">
            {searchActivity.found}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Última execução</span>
          <span className="font-mono text-text-primary">
            {searchActivity.lastRun}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Status</span>
          <Badge variant="success">{searchActivity.status}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export { SearchActivity };
