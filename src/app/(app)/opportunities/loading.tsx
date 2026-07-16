import { Skeleton } from "@/components/ui/skeleton";

/** Espelha a estrutura da fila: cabeçalho, barra de filtros e tabela. */
export default function OpportunitiesLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="overflow-hidden rounded-card border border-border-subtle">
          <Skeleton className="h-10 w-full rounded-none opacity-60" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[4.25rem] w-full rounded-none border-t border-border-subtle"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
