import { UserCog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

export default async function SettingsGeneralPage() {
  const { repositories } = await createServerContext();
  const operator = await repositories.profiles.getFirst();

  if (!operator) {
    return (
      <EmptyState
        icon={UserCog}
        title="Sem operador"
        description="Nenhum operador cadastrado ainda."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border-subtle p-5 py-0">
        <Row label="Nome" value={operator.display_name} />
        <Row label="E-mail" value={operator.email ?? "—"} />
        <Row label="Papel" value={operator.role} />
        <Row label="Fuso horário" value="America/Sao_Paulo" />
      </CardContent>
    </Card>
  );
}
