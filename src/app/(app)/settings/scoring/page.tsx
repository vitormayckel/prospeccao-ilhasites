export const dynamic = "force-dynamic";

// Modelo de score vigente (Blueprint §9.2). Pesos tornam-se editáveis na Fase 4.
const dimensions = [
  { label: "Lacuna de presença digital", max: 30 },
  { label: "Potencial comercial do negócio", max: 20 },
  { label: "Confiança e reputação pública", max: 15 },
  { label: "Facilidade de contato", max: 15 },
  { label: "Oportunidade de comunicação", max: 10 },
  { label: "Qualidade e completude dos dados", max: 10 },
];

const TOTAL = dimensions.reduce((sum, d) => sum + d.max, 0);
const HEAVIEST = Math.max(...dimensions.map((d) => d.max));

export default function SettingsScoringPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-heading text-text-primary">Modelo de score</h2>
        <p className="max-w-[68ch] text-meta text-text-secondary">
          Composição vigente (máximo {TOTAL}). Os pesos serão editáveis quando a
          análise por IA for ativada.
        </p>
      </div>

      {/* O peso de cada dimensão se lê pela barra antes do número. */}
      <div className="divide-y divide-border-subtle border-y border-border-subtle">
        {dimensions.map((d) => (
          <div key={d.label} className="flex items-center gap-4 py-3.5">
            <span className="min-w-0 flex-1 text-meta text-text-primary">
              {d.label}
            </span>
            <span
              aria-hidden
              className="hidden h-[3px] w-32 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:block"
            >
              <span
                className="bg-accent/70 block h-full rounded-full"
                style={{ width: `${(d.max / HEAVIEST) * 100}%` }}
              />
            </span>
            <span className="tnum w-14 shrink-0 text-right font-mono text-micro text-text-secondary">
              {d.max} pts
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="eyebrow">Total</span>
        <span className="tnum font-mono text-meta font-semibold text-text-primary">
          {TOTAL}
        </span>
      </div>
    </div>
  );
}
