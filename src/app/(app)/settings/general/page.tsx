import { UserCog } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SettingsGeneralPage() {
  return (
    <EmptyState
      icon={UserCog}
      title="Preferências gerais"
      description="Perfil, fuso horário e dias úteis serão ajustáveis aqui nas próximas fases."
    />
  );
}
