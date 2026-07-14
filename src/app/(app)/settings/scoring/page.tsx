import { Card, CardContent } from "@/components/ui/card";

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

export default function SettingsScoringPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">
          Modelo de score
        </h2>
        <p className="text-sm text-text-secondary">
          Composição vigente (máximo 100). Os pesos serão editáveis quando a
          análise por IA for ativada.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y divide-border-subtle p-5 py-0">
          {dimensions.map((d) => (
            <div
              key={d.label}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span className="text-text-primary">{d.label}</span>
              <span className="tnum text-text-secondary">{d.max} pts</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
