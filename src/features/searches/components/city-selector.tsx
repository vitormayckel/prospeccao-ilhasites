"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchMunicipiosAction } from "@/server/actions/municipios";
import type { Municipio } from "@/server/services/municipios";

// =====================================================================
// Seletor estruturado de municípios.
//
// Substitui o par "texto livre de cidades" + "UF com default ES", que fazia
// cidades de MG serem pesquisadas como ES. Aqui a UF nunca é digitada: vem
// sempre do município escolhido na base do IBGE.
//
// Nomes repetidos entre estados aparecem como opções distintas ("Bom Jesus
// — RS", "Bom Jesus — SC"), então a ambiguidade se resolve na seleção.
// =====================================================================

export interface SelectedCity {
  city: string;
  state: string;
  stateName: string;
  ibgeCode: number;
}

interface CitySelectorProps {
  /** Cidades já selecionadas (perfis existentes). */
  value: SelectedCity[];
  onChange: (cities: SelectedCity[]) => void;
  /** Nome do campo hidden que carrega o JSON no submit do form. */
  name?: string;
}

export function CitySelector({
  value,
  onChange,
  name = "locations",
}: CitySelectorProps) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<Municipio[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Busca no servidor com debounce — a base não trafega para o navegador.
  useEffect(() => {
    if (term.trim().length < 2) {
      setOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        setOptions(await searchMunicipiosAction(term));
        setOpen(true);
      });
    }, 220);
    return () => clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function add(m: Municipio) {
    if (value.some((v) => v.ibgeCode === m.ibgeCode)) {
      setTerm("");
      setOpen(false);
      return;
    }
    onChange([
      ...value,
      {
        city: m.city,
        state: m.state,
        stateName: m.stateName,
        ibgeCode: m.ibgeCode,
      },
    ]);
    setTerm("");
    setOpen(false);
  }

  function remove(ibgeCode: number) {
    onChange(value.filter((v) => v.ibgeCode !== ibgeCode));
  }

  return (
    <div className="space-y-2.5" ref={boxRef}>
      {/* O form envia o JSON estruturado: cidade e UF nunca se separam. */}
      <input type="hidden" name={name} value={JSON.stringify(value)} />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
          strokeWidth={1.5}
          aria-hidden
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          placeholder="Digite a cidade (ex.: Betim)"
          className="pl-9"
          autoComplete="off"
          aria-label="Buscar município"
        />

        {open && options.length > 0 ? (
          <ul
            role="listbox"
            className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-card border border-border-subtle bg-surface-2 py-1 shadow-raise"
          >
            {options.map((m) => {
              const already = value.some((v) => v.ibgeCode === m.ibgeCode);
              return (
                <li key={m.ibgeCode}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={already}
                    disabled={already}
                    onClick={() => add(m)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-meta transition-colors",
                      already
                        ? "cursor-default text-text-muted"
                        : "text-text-primary hover:bg-surface-3",
                    )}
                  >
                    <MapPin
                      className="size-3.5 shrink-0 text-text-muted"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{m.city}</span>
                    {/* A UF é sempre visível: não há como escolher errado. */}
                    <span className="shrink-0 font-mono text-micro text-text-secondary">
                      {m.state}
                    </span>
                    {already ? (
                      <span className="shrink-0 text-micro text-text-muted">
                        adicionada
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {isPending && term.length >= 2 ? (
        <p className="text-micro text-text-muted">Buscando municípios...</p>
      ) : null}

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <li key={c.ibgeCode}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 py-1 pl-2.5 pr-1 text-micro text-text-primary">
                {c.city}
                <span className="font-mono text-text-secondary">{c.state}</span>
                <button
                  type="button"
                  onClick={() => remove(c.ibgeCode)}
                  className="rounded-full p-0.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
                  aria-label={`Remover ${c.city} — ${c.state}`}
                >
                  <X className="size-3" strokeWidth={2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-micro text-text-muted">
          Nenhuma cidade selecionada. A UF vem da própria seleção.
        </p>
      )}
    </div>
  );
}
