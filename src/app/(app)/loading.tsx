import { Skeleton } from "@/components/ui/skeleton";

/** Espelha a estrutura do dashboard: faixa de KPIs + duas colunas. */
export default function AppLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-[8.5rem] w-full rounded-card" />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-72 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    </div>
  );
}
