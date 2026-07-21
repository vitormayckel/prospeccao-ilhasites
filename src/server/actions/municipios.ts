"use server";

import {
  searchMunicipios,
  resolveCity,
  type Municipio,
} from "@/server/services/municipios";

/**
 * Busca municípios para o seletor de cidades.
 *
 * A base tem ~250 kB e fica no servidor: só as opções filtradas trafegam.
 */
export async function searchMunicipiosAction(
  term: string,
): Promise<Municipio[]> {
  return searchMunicipios(term, 20);
}

export interface CityCheck {
  status: "exact" | "corrected" | "ambiguous" | "unknown";
  municipio: Municipio | null;
  options: Municipio[];
  message: string | null;
}

/**
 * Confere uma cidade digitada (ou vinda de perfil antigo) contra a base do
 * IBGE. Usado para bloquear o início de execução com UF não validada.
 */
export async function checkCityAction(
  city: string,
  state: string | null,
): Promise<CityCheck> {
  const result = resolveCity(city, state);
  const messages: Record<CityCheck["status"], string | null> = {
    exact: null,
    corrected: result.municipio
      ? `"${city}" pertence a ${result.municipio.state}, não a ${state}. Será corrigido para ${result.municipio.label}.`
      : null,
    ambiguous: `"${city}" existe em mais de um estado (${result.options
      .map((o) => o.state)
      .join(", ")}). Escolha a opção correta.`,
    unknown: `"${city}" não foi encontrada na base de municípios do IBGE. Verifique a grafia.`,
  };
  return {
    status: result.status,
    municipio: result.municipio,
    options: result.options,
    message: messages[result.status],
  };
}
