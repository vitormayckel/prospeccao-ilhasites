import { Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { createServerContext } from "@/server/context";
import type { IntegrationStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const statusMeta: Record<
  IntegrationStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  not_configured: { label: "Não configurado", variant: "neutral" },
  connected: { label: "Conectado", variant: "success" },
  error: { label: "Erro", variant: "danger" },
  disconnected: { label: "Desconectado", variant: "warning" },
};

const providerLabel: Record<string, string> = {
  google_places: "Provedor de locais (Google Places)",
  anthropic: "Provedor de IA (Anthropic)",
};

export default async function SettingsIntegrationsPage() {
  const { repositories } = await createServerContext();
  const integrations = await repositories.integrations.list();

  if (integrations.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title="Sem integrações"
        description="Nenhuma integração registrada."
      />
    );
  }

  return (
    <div className="space-y-3">
      {integrations.map((it) => {
        const meta = statusMeta[it.status];
        return (
          <Card key={it.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {providerLabel[it.provider] ?? it.provider}
                </p>
                <p className="text-xs text-text-muted">
                  Última verificação: {formatDateTime(it.last_checked_at)}
                </p>
              </div>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
