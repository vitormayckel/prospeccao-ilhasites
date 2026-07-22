"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const statusTabs = [
  { value: "all", label: "Todas" },
  { value: "pending_review", label: "Aguardando" },
  { value: "approved", label: "Aprovadas" },
  { value: "snoozed", label: "Adiadas" },
  { value: "rejected", label: "Rejeitadas" },
];

/*
 * "Score análise" saiu: dois scores ordenáveis confundiam a decisão diária.
 * `commercial_score` é a métrica final e é o padrão — sempre do maior para o
 * menor, com alternância explícita para crescente.
 */
const sortOptions = [
  { value: "commercial", label: "Score comercial" },
  { value: "priority", label: "Prioridade" },
  { value: "name", label: "Nome" },
  { value: "created_at", label: "Mais recentes" },
];

export function OpportunitiesControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const currentStatus = params.get("status") ?? "all";
  const currentSort = params.get("sort") ?? "commercial";
  const currentOrder = params.get("order") === "asc" ? "asc" : "desc";
  const currentSearch = params.get("search") ?? "";
  const sortLabel =
    sortOptions.find((o) => o.value === currentSort)?.label ?? "Score comercial";

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page"); // qualquer mudança volta para a primeira página
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    /*
     * Uma barra só, sem moldura: os filtros pertencem à tabela logo abaixo e
     * não a um card separado flutuando acima dela.
     */
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <Tabs
        value={currentStatus}
        onValueChange={(v) => update({ status: v === "all" ? null : v })}
      >
        <TabsList className="flex-wrap">
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("search");
            update({ search: typeof value === "string" ? value : null });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            name="search"
            defaultValue={currentSearch}
            placeholder="Buscar por nome..."
            className="h-8 pl-9 text-meta"
            aria-label="Buscar empresas"
          />
        </form>

        <div className="flex items-center gap-1.5">
          <div className="w-full sm:w-44">
            <Select
              value={currentSort}
              // Trocar de critério sempre recomeça em decrescente: é o que o
              // operador espera ao pedir "as melhores primeiro".
              onValueChange={(v) => update({ sort: v, order: null })}
            >
              <SelectTrigger aria-label="Ordenar por" className="h-8 text-meta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 shrink-0 px-2"
            aria-label={`${sortLabel}: ${currentOrder === "desc" ? "maior para menor" : "menor para maior"}. Clique para inverter.`}
            title={
              currentOrder === "desc" ? "Maior para menor" : "Menor para maior"
            }
            onClick={() =>
              update({ order: currentOrder === "desc" ? "asc" : null })
            }
          >
            {currentOrder === "desc" ? <ArrowDown /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  );
}
