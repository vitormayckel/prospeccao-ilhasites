import { PageHeader } from "@/components/layout/page-header";
import { SectionLabel } from "@/components/ui/section-label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createServerContext } from "@/server/context";
import {
  approachChannelLabel,
  pipelineStageLabel,
} from "@/features/opportunities/labels";
import type {
  ApproachChannel,
  PipelineStage,
} from "@/types/domain";
import type {
  ConversionReport,
  LabeledValue,
} from "@/server/repositories/reports-repository";

export const dynamic = "force-dynamic";

/** Percentual seguro: "—" quando não há base (nunca inventa taxa). */
function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  return `${((n / d) * 100).toFixed(1).replace(".", ",")}%`;
}

/** Célula de métrica simples (mesma linguagem visual da faixa do dashboard). */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 bg-surface-1 px-4 py-3.5">
      <p className="eyebrow truncate">{label}</p>
      <p
        className={cn(
          "tnum mt-2 text-heading",
          accent ? "text-accent" : "text-text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-4">
        {children}
      </div>
    </Card>
  );
}

/** Passo do funil de conversão, com a taxa relativa ao passo anterior. */
function FunnelStep({
  label,
  value,
  base,
  prev,
  isFirst,
}: {
  label: string;
  value: number;
  base: number;
  prev: number;
  isFirst?: boolean;
}) {
  const widthPct = base > 0 ? Math.round((value / base) * 100) : 0;
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta text-text-primary">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="tnum font-mono text-body font-semibold text-text-primary">
            {value}
          </span>
          {!isFirst ? (
            <span className="tnum text-micro text-text-muted">
              {pct(value, prev)} do passo anterior
            </span>
          ) : null}
        </span>
      </div>
      <span
        aria-hidden
        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <span
          className="bg-accent/70 block h-full rounded-full"
          style={{ width: `${widthPct}%` }}
        />
      </span>
    </div>
  );
}

function ConversionSection({ c }: { c: ConversionReport }) {
  const steps = [
    { label: "Empresas abordadas", value: c.approached },
    { label: "Responderam", value: c.replied },
    { label: "Decisor identificado", value: c.decisionMaker },
    { label: "Proposta", value: c.proposal },
    { label: "Venda", value: c.sale },
  ];
  return (
    <Card className="p-5">
      {c.approached === 0 ? (
        <p className="text-meta text-text-muted">
          Dados insuficientes para análise.
        </p>
      ) : (
        <>
          <div className="divide-y divide-border-subtle">
            {steps.map((s, i) => (
              <FunnelStep
                key={s.label}
                label={s.label}
                value={s.value}
                base={c.approached}
                prev={i === 0 ? s.value : steps[i - 1]!.value}
                isFirst={i === 0}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border-subtle pt-4 text-micro text-text-muted">
            <span>
              Resposta:{" "}
              <span className="tnum text-text-secondary">
                {pct(c.replied, c.approached)}
              </span>
            </span>
            <span>
              Venda / abordadas:{" "}
              <span className="tnum text-accent">
                {pct(c.sale, c.approached)}
              </span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/** Indicador de inteligência; mostra fallback quando não há base. */
function Indicator({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <p className="eyebrow mb-1.5">{label}</p>
      <p
        className={cn(
          "text-body",
          value ? "text-text-primary" : "text-text-muted",
        )}
      >
        {value ?? "Dados insuficientes"}
      </p>
    </div>
  );
}

function labeled(v: LabeledValue | null): string | null {
  return v ? `${v.label} (${v.value})` : null;
}

export default async function ReportsPage() {
  const { repositories } = await createServerContext();
  const { collection, operation, conversion, intelligence } =
    await repositories.reports.getWeekly();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Resultados"
        title="Relatórios"
        description="Coleta e operação dos últimos 7 dias, funil de conversão acumulado e aprendizado comercial."
      />

      <section className="space-y-4">
        <SectionLabel>Coleta · últimos 7 dias</SectionLabel>
        <StatStrip>
          <Stat label="Encontradas" value={collection.found} />
          <Stat label="Analisadas" value={collection.analyzed} />
          <Stat label="Aprovadas" value={collection.approved} />
          <Stat label="Descartadas" value={collection.discarded} />
        </StatStrip>
      </section>

      <section className="space-y-4">
        <SectionLabel>Operação · últimos 7 dias</SectionLabel>
        <StatStrip>
          <Stat label="Abordagens WhatsApp" value={operation.whatsapp} />
          <Stat label="Abordagens Instagram" value={operation.instagram} />
          <Stat label="Follow-ups" value={operation.followUps} />
          <Stat label="Respostas" value={operation.replies} />
        </StatStrip>
      </section>

      <section className="space-y-4">
        <SectionLabel>Conversão</SectionLabel>
        <ConversionSection c={conversion} />
      </section>

      <section className="space-y-4">
        <SectionLabel>Inteligência comercial</SectionLabel>
        {!intelligence.hasData ? (
          <Card className="p-5">
            <p className="text-meta text-text-muted">
              Dados insuficientes para análise. Os indicadores aparecem conforme
              a operação avança.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Indicator
              label="Melhor segmento"
              value={labeled(intelligence.bestSegment)}
            />
            <Indicator
              label="Cidade com maior resposta"
              value={labeled(intelligence.topCity)}
            />
            <Indicator
              label="Canal com maior conversão"
              value={
                intelligence.bestChannel
                  ? `${approachChannelLabel[intelligence.bestChannel.channel as ApproachChannel]} (${(
                      intelligence.bestChannel.rate * 100
                    )
                      .toFixed(1)
                      .replace(".", ",")}%)`
                  : null
              }
            />
            <Indicator
              label="Follow-ups registrados"
              value={String(intelligence.followUps)}
            />
            <Indicator
              label="Principal estágio do funil"
              value={
                intelligence.mainStage
                  ? pipelineStageLabel[intelligence.mainStage as PipelineStage]
                  : null
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
