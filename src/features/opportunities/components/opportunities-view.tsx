"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OpportunitiesTable } from "@/features/opportunities/components/opportunities-table";
import {
  opportunities,
  type ReviewStatus,
} from "@/features/opportunities/mock-data";

const tabs: { value: string; label: string; status?: ReviewStatus }[] = [
  { value: "pending", label: "Aguardando", status: "pending_review" },
  { value: "approved", label: "Aprovadas", status: "approved" },
  { value: "snoozed", label: "Adiadas", status: "snoozed" },
  { value: "rejected", label: "Rejeitadas", status: "rejected" },
  { value: "all", label: "Todas" },
];

/** Fila de oportunidades com filtro por aba (visual, dados mockados). */
function OpportunitiesView() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input placeholder="Buscar nesta lista..." className="pl-9" />
        </div>
        <div className="w-full sm:w-48">
          <Select>
            <SelectTrigger aria-label="Filtrar por cidade">
              <SelectValue placeholder="Todas as cidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as cidades</SelectItem>
              <SelectItem value="vitoria">Vitória</SelectItem>
              <SelectItem value="vila-velha">Vila Velha</SelectItem>
              <SelectItem value="serra">Serra</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => {
          const rows = tab.status
            ? opportunities.filter((o) => o.status === tab.status)
            : opportunities;
          return (
            <TabsContent key={tab.value} value={tab.value}>
              <OpportunitiesTable rows={rows} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

export { OpportunitiesView };
