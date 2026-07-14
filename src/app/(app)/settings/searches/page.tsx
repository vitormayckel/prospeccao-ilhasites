import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateSearchProfileDialog } from "@/features/searches/components/create-search-profile-dialog";
import { ProfileStatusToggle } from "@/features/searches/components/profile-status-toggle";
import { formatDate } from "@/lib/format";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function SettingsSearchesPage() {
  const { repositories } = await createServerContext();
  const profiles = await repositories.searchProfiles.list();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-text-primary">
            Perfis de pesquisa
          </h2>
          <p className="text-sm text-text-secondary">
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
        <div className="space-y-3">
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {p.name}
                    </span>
                    <Badge
                      variant={p.status === "active" ? "success" : "neutral"}
                    >
                      {p.status === "active" ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {p.cities.length > 0 ? p.cities.join(", ") : "Sem cidades"}{" "}
                    · {p.category_count} categorias · limite {p.daily_limit}/dia
                    · {p.run_time}
                  </p>
                  <p className="text-xs text-text-muted">
                    Última execução: {formatDate(p.last_run_at)}
                  </p>
                </div>
                <ProfileStatusToggle id={p.id} status={p.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
