import "server-only";
import { MUNICIPIOS, UF_NAMES } from "@/lib/data/municipios";

// =====================================================================
// Consulta à base oficial de municípios (IBGE, 5570 registros).
//
// server-only de propósito: a base tem ~250 kB e não deve ser enviada ao
// navegador. A busca do seletor de cidades passa por Server Action.
//
// Resolve a causa do bug de UF: o formulário antigo tinha um campo de texto
// livre com default "ES", então cidades de MG foram gravadas como ES e a
// consulta ao Google Places virou "Betim, ES".
// =====================================================================

export interface Municipio {
  ibgeCode: number;
  city: string;
  state: string;
  stateName: string;
  /** Rótulo de exibição: "Betim — MG". */
  label: string;
}

/** Normaliza para busca: sem acento, minúsculo, espaços colapsados. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toMunicipio(tuple: readonly [number, string, string]): Municipio {
  const [ibgeCode, city, state] = tuple;
  return {
    ibgeCode,
    city,
    state,
    stateName: UF_NAMES[state] ?? state,
    label: `${city} — ${state}`,
  };
}

/** Índice por nome normalizado, montado uma vez por processo. */
let byName: Map<string, Municipio[]> | null = null;

function index(): Map<string, Municipio[]> {
  if (byName) return byName;
  const map = new Map<string, Municipio[]>();
  for (const tuple of MUNICIPIOS) {
    const m = toMunicipio(tuple);
    const key = normalizeSearch(m.city);
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  }
  byName = map;
  return map;
}

/** Busca por prefixo/trecho do nome. Ordena por relevância e nome. */
export function searchMunicipios(term: string, limit = 20): Municipio[] {
  const q = normalizeSearch(term);
  if (q.length < 2) return [];

  const starts: Municipio[] = [];
  const contains: Municipio[] = [];

  for (const tuple of MUNICIPIOS) {
    const name = normalizeSearch(tuple[1]);
    if (name.startsWith(q)) starts.push(toMunicipio(tuple));
    else if (name.includes(q)) contains.push(toMunicipio(tuple));
    if (starts.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}

/**
 * Todas as UFs em que existe um município com este nome exato.
 * Mais de uma → o nome é ambíguo e exige seleção explícita.
 */
export function resolveByName(city: string): Municipio[] {
  return index().get(normalizeSearch(city)) ?? [];
}

/** O nome existe em mais de uma UF? */
export function isAmbiguous(city: string): boolean {
  return resolveByName(city).length > 1;
}

/** Confirma que o par cidade+UF existe de fato na base oficial. */
export function findExact(city: string, state: string): Municipio | null {
  const uf = state.trim().toUpperCase();
  return (
    resolveByName(city).find((m) => m.state === uf) ?? null
  );
}

/**
 * Resolve uma cidade quando a UF é desconhecida ou suspeita.
 *
 * Devolve `status`:
 *  - "exact"     → o par cidade+UF informado existe;
 *  - "corrected" → a UF informada não tem esse município, mas o nome existe
 *                  em exatamente UMA outra UF (correção inequívoca);
 *  - "ambiguous" → o nome existe em várias UFs: exige escolha humana;
 *  - "unknown"   → o nome não existe na base.
 */
export function resolveCity(
  city: string,
  state: string | null,
): {
  status: "exact" | "corrected" | "ambiguous" | "unknown";
  municipio: Municipio | null;
  options: Municipio[];
} {
  const options = resolveByName(city);
  if (options.length === 0) {
    return { status: "unknown", municipio: null, options: [] };
  }

  if (state) {
    const exact = findExact(city, state);
    if (exact) return { status: "exact", municipio: exact, options };
  }

  // Sem UF válida: só corrige quando não há dúvida possível.
  if (options.length === 1) {
    return { status: "corrected", municipio: options[0]!, options };
  }
  return { status: "ambiguous", municipio: null, options };
}
