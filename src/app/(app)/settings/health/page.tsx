import {
  Database,
  MapPin,
  Sparkles,
  KeyRound,
  GitBranch,
  Layers,
  Check,
  X,
  BarChart3,
  Clock,
} from "lucide-react";
import { HealthCard } from "@/features/settings/components/health-card";
import { formatDateTime } from "@/lib/format";
import { createServerContext } from "@/server/context";

// Snapshot único no carregamento da página — sem polling/monitoramento.
export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const { services } = await createServerContext();
  const report = await services.health.getReport();

  const allEnvPresent = report.requiredEnv.every((e) => e.present);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-heading text-text-primary">Saúde do Sistema</h2>
        <p className="max-w-[68ch] text-meta text-text-secondary">
          Verificação rápida da infraestrutura antes da operação. Carregada uma
          vez na abertura desta página — sem monitoramento contínuo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* 1. Supabase */}
        <HealthCard title="Supabase" icon={Database} tone={report.supabase.tone}>
          {report.supabase.detail}
        </HealthCard>

        {/* 2. Google Places */}
        <HealthCard
          title="Google Places"
          icon={MapPin}
          tone={report.googlePlaces.tone}
        >
          {report.googlePlaces.detail}
        </HealthCard>

        {/* 3. Anthropic */}
        <HealthCard title="Anthropic" icon={Sparkles} tone={report.anthropic.tone}>
          <p>{report.anthropic.detail}</p>
          {report.anthropic.model ? (
            <p className="mt-1.5 text-micro text-text-muted">
              Modelo:{" "}
              <span className="font-mono text-text-secondary">
                {report.anthropic.model}
              </span>
            </p>
          ) : null}
        </HealthCard>

        {/* 4. Variáveis obrigatórias */}
        <HealthCard
          title="Variáveis obrigatórias"
          icon={KeyRound}
          tone={allEnvPresent ? "ok" : "error"}
        >
          <ul className="space-y-1">
            {report.requiredEnv.map((e) => (
              <li key={e.name} className="flex items-center gap-2">
                {e.present ? (
                  <Check className="size-3.5 shrink-0 text-success" />
                ) : (
                  <X className="size-3.5 shrink-0 text-danger" />
                )}
                <span className="truncate font-mono text-micro text-text-secondary">
                  {e.name}
                </span>
                <span
                  className={
                    "ml-auto shrink-0 text-micro " +
                    (e.present ? "text-success" : "text-danger")
                  }
                >
                  {e.present ? "configurada" : "ausente"}
                </span>
              </li>
            ))}
          </ul>
        </HealthCard>

        {/* 5. Migration 0005 */}
        <HealthCard
          title="Migration 0005"
          icon={Layers}
          tone={report.migration0005.tone}
        >
          <p>
            {report.migration0005.tone === "ok"
              ? "Migration aplicada"
              : report.migration0005.tone === "warn"
                ? "Migration pendente"
                : "Verificação indisponível"}
          </p>
          <p className="mt-1.5 text-micro text-text-muted">
            enum message_kind ⊇ after_conversation
          </p>
        </HealthCard>

        {/* 6. Banco (contagens) */}
        <HealthCard
          title="Banco"
          icon={BarChart3}
          tone={report.counts ? "info" : "error"}
        >
          {report.counts ? (
            <dl className="grid grid-cols-2 gap-3">
              <Count label="Empresas" value={report.counts.companies} />
              <Count label="Análises" value={report.counts.analyses} />
              <Count label="Mensagens" value={report.counts.messages} />
              <Count label="Follow-ups" value={report.counts.followUps} />
            </dl>
          ) : (
            "Contagens indisponíveis."
          )}
        </HealthCard>

        {/* 7. Versão */}
        <HealthCard title="Versão" icon={GitBranch} tone="info">
          <p>
            package.json:{" "}
            <span className="font-mono text-text-secondary">
              v{report.version.version}
            </span>
          </p>
          <p className="mt-1.5 text-micro text-text-muted">
            commit:{" "}
            <span className="font-mono">
              {report.version.commit ?? "indisponível (build local)"}
            </span>
          </p>
        </HealthCard>

        {/* 8. Última análise */}
        <HealthCard
          title="Última análise"
          icon={Clock}
          tone={report.lastAnalysisAt ? "info" : "warn"}
        >
          {report.lastAnalysisAt
            ? formatDateTime(report.lastAnalysisAt)
            : "Nenhuma análise registrada."}
        </HealthCard>
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-heading text-text-primary">{value}</dd>
    </div>
  );
}
