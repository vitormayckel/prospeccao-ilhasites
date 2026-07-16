import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { ProfileStatusToggle } from "@/features/searches/components/profile-status-toggle";
import { RunSearchButton } from "@/features/searches/components/run-search-button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SearchProfileCardProps {
  profile: {
    id: string;
    name: string;
    status: "active" | "paused";
    cities: string[];
    category_count: number;
    daily_limit: number;
    run_time: string;
    last_run_at: string | null;
  };
}

/** Célula de leitura rápida do rodapé do card. */
function Spec({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 bg-surface-1 px-5 py-3">
      <p className="truncate text-micro text-text-muted">{label}</p>
      <p className="tnum mt-1 truncate font-mono text-meta text-text-primary">
        {value}
      </p>
      {detail ? (
        <p
          className="mt-0.5 truncate text-micro text-text-muted"
          title={detail}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/*
 * Perfil como painel de instrumentos, não linha de lista: identidade e ações
 * no topo, parâmetros embaixo em células rotuladas. Antes os quatro números
 * viviam numa única frase corrida separada por "·", ilegível de relance.
 */
export function SearchProfileCard({ profile: p }: SearchProfileCardProps) {
  const active = p.status === "active";
  return (
    <Card className="overflow-hidden transition-colors hover:border-border">
      <div className="flex flex-col gap-3 px-5 pb-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusDot tone={active ? "success" : "neutral"} />
          <Link
            href={`/settings/searches/${p.id}`}
            className="truncate text-body font-semibold tracking-[-0.01em] text-text-primary outline-none transition-colors hover:text-accent focus-visible:text-accent"
          >
            {p.name}
          </Link>
          <span
            className={cn(
              "shrink-0 text-micro",
              active ? "text-success" : "text-text-muted",
            )}
          >
            {active ? "Ativo" : "Pausado"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ProfileStatusToggle id={p.id} status={p.status} />
          <RunSearchButton profileId={p.id} mode="run" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-4">
        <Spec
          label="Cidades"
          value={String(p.cities.length)}
          detail={p.cities.length > 0 ? p.cities.join(", ") : "Sem cidades"}
        />
        <Spec label="Categorias" value={String(p.category_count)} />
        <Spec label="Limite diário" value={`${p.daily_limit}/dia`} />
        <Spec
          label="Execução"
          value={p.run_time}
          detail={`Última: ${formatDate(p.last_run_at)}`}
        />
      </div>
    </Card>
  );
}
