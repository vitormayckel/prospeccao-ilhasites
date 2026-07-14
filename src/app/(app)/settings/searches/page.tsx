import { SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function SettingsSearchesPage() {
  return (
    <EmptyState
      icon={SlidersHorizontal}
      title="Perfis de pesquisa"
      description="A configuração de cidades, categorias, agenda e limites será construída na Fase 3."
      action={<Button variant="secondary">Novo perfil</Button>}
    />
  );
}
