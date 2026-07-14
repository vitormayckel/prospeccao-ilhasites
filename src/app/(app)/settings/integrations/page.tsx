import { Plug } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SettingsIntegrationsPage() {
  return (
    <EmptyState
      icon={Plug}
      title="Integrações"
      description="Provedores de dados e de IA, além da saúde das integrações, entram nas Fases 3 e 4."
    />
  );
}
