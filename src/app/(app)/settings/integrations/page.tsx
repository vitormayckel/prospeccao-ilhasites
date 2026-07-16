import { Plug } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { formatDateTime } from "@/lib/format";
import { createServerContext } from "@/server/context";
import type { IntegrationStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const statusMeta: Record<
  IntegrationStatus,
  { label: string; tone: StatusTone }
> = {
  not_configured: { label: "Não configurado", tone: "neutral" },
  connected: { label: "Conectado", tone: "success" },
  error: { label: "Erro", tone: "danger" },
  disconnected: { label: "Desconectado", tone: "warning" },
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
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-heading text-text-primary">Integrações</h2>
        <p className="max-w-[68ch] text-meta text-text-secondary">
          Provedores externos usados pela coleta e pela análise.
        </p>
      </div>

      <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle">
        {integrations.map((it) => {
          const meta = statusMeta[it.status];
          return (
            <div
              key={it.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-text-primary">
                  {providerLabel[it.provider] ?? it.provider}
                </p>
                <p className="text-micro text-text-muted">
                  Última verificação: {formatDateTime(it.last_checked_at)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-meta text-text-secondary">
                <StatusDot tone={meta.tone} />
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
