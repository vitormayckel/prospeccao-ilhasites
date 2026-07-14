"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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

const sortOptions = [
  { value: "priority", label: "Prioridade" },
  { value: "score", label: "Score" },
  { value: "name", label: "Nome" },
  { value: "created_at", label: "Mais recentes" },
];

export function OpportunitiesControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const currentStatus = params.get("status") ?? "all";
  const currentSort = params.get("sort") ?? "priority";
  const currentSearch = params.get("search") ?? "";

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative w-full sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("search");
            update({ search: typeof value === "string" ? value : null });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            name="search"
            defaultValue={currentSearch}
            placeholder="Buscar por nome..."
            className="pl-9"
            aria-label="Buscar empresas"
          />
        </form>

        <div className="w-full sm:w-48">
          <Select
            value={currentSort}
            onValueChange={(v) => update({ sort: v })}
          >
            <SelectTrigger aria-label="Ordenar por">
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
      </div>

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
    </div>
  );
}
