"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho "Score" clicável — alterna a ordenação pelo score comercial.
 *
 * Fora do critério comercial o cabeçalho apenas volta para ele (decrescente);
 * já nele, inverte. É o mesmo estado do seletor da barra de filtros: ambos
 * escrevem em `sort`/`order` na URL, então nunca divergem.
 */
export function ScoreSortHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ativo = (params.get("sort") ?? "commercial") === "commercial";
  const ordem = params.get("order") === "asc" ? "asc" : "desc";

  function onClick() {
    const next = new URLSearchParams(params.toString());
    next.set("sort", "commercial");
    // `desc` é o padrão do schema: omitir mantém a URL limpa.
    if (ativo && ordem === "desc") next.set("order", "asc");
    else next.delete("order");
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
    // O Router Cache pode devolver o payload já visto para uma URL repetida
    // (alternar desc → asc → desc em poucos segundos). O refresh garante que a
    // lista reordene na hora, sem recarregar a página na mão.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        ativo
          ? `Score comercial, ${ordem === "desc" ? "maior para menor" : "menor para maior"}. Clique para inverter.`
          : "Ordenar por score comercial"
      }
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none transition-colors",
        "hover:text-text-primary focus-visible:ring-1 focus-visible:ring-accent",
        ativo ? "text-text-secondary" : "text-text-muted",
      )}
    >
      Score
      {ativo ? (
        ordem === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className="size-3" />
        )
      ) : null}
    </button>
  );
}
