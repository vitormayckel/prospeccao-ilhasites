import { SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateSearchProfileDialog } from "@/features/searches/components/create-search-profile-dialog";
import { SearchProfileCard } from "@/features/searches/components/search-profile-card";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function SettingsSearchesPage() {
  const { repositories } = await createServerContext();
  const profiles = await repositories.searchProfiles.list();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-heading text-text-primary">Perfis de pesquisa</h2>
          <p className="text-meta text-text-secondary">
            Cidades, categorias e agenda de coleta.
          </p>
        </div>
        <CreateSearchProfileDialog />
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Nenhum perfil"
          description="Crie um perfil de pesquisa para organizar cidades e categorias."
        />
      ) : (
        <div className="space-y-4">
          {profiles.map((p) => (
            <SearchProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  );
}
