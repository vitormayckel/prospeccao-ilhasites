import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SettingsScoringPage() {
  return (
    <EmptyState
      icon={Gauge}
      title="Score"
      description="Os pesos das dimensões e a versão ativa do score serão configuráveis na Fase 4."
    />
  );
}
