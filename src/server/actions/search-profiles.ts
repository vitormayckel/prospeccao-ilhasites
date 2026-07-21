"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { toActionError } from "@/lib/errors";
import {
  searchProfileInputSchema,
  updateSearchProfileInputSchema,
} from "@/lib/validation/search-profile";
import type { ActionResult } from "@/server/actions/opportunities";
import type { SearchProfileStatus } from "@/types/domain";
import { findExact, resolveByName } from "@/server/services/municipios";

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Lê as localidades vindas do seletor estruturado (JSON com cidade+UF+IBGE)
 * e reconfere cada uma contra a base do IBGE.
 *
 * A reconferência no servidor é o que garante o requisito "não permitir
 * execução com cidade sem UF validada": o cliente pode ser burlado, esta
 * checagem não.
 */
function parseLocations(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    throw new Error("Seleção de cidades inválida. Refaça a seleção.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Selecione ao menos uma cidade na lista.");
  }

  return parsed.map((raw) => {
    const item = raw as { city?: unknown; state?: unknown };
    const city = String(item.city ?? "").trim();
    const state = String(item.state ?? "")
      .trim()
      .toUpperCase();

    const municipio = findExact(city, state);
    if (!municipio) {
      const options = resolveByName(city);
      if (options.length > 1) {
        throw new Error(
          `"${city}" existe em ${options.map((o) => o.state).join(", ")}. Escolha a opção correta na lista.`,
        );
      }
      throw new Error(
        `"${city} — ${state || "sem UF"}" não confere com a base de municípios do IBGE.`,
      );
    }

    return {
      city: municipio.city,
      state: municipio.state,
      countryCode: "BR",
      ibgeCode: municipio.ibgeCode,
      stateName: municipio.stateName,
    };
  });
}

/** Dias da semana marcados no formulário (1=seg … 7=dom). */
function parseWeekdays(values: FormDataEntryValue[]): number[] {
  return values
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

export async function createSearchProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const categories = splitList(formData.get("categories"));

    const input = searchProfileInputSchema.parse({
      name: formData.get("name"),
      runTime: formData.get("runTime") || "07:00",
      dailyLimit: Number(formData.get("dailyLimit") || 50),
      // Cidade e UF vêm juntas do seletor e são reconferidas no servidor.
      locations: parseLocations(formData.get("locations")),
      categories: categories.map((label) => ({ label })),
    });

    const { repositories } = await createServerContext();
    await repositories.searchProfiles.create(input);
    revalidatePath("/settings/searches");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError("action.createSearchProfile", error, "Erro ao criar perfil."),
    };
  }
}

export async function updateSearchProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const categories = splitList(formData.get("categories"));
    const weekdays = parseWeekdays(formData.getAll("weekdays"));

    const input = updateSearchProfileInputSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      runTime: formData.get("runTime") || "07:00",
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      dailyLimit: Number(formData.get("dailyLimit") || 50),
      locations: parseLocations(formData.get("locations")),
      categories: categories.map((label) => ({ label })),
    });

    const { repositories } = await createServerContext();
    await repositories.searchProfiles.update(input);
    revalidatePath("/settings/searches");
    revalidatePath(`/settings/searches/${input.id}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError("action.updateSearchProfile", error, "Erro ao salvar perfil."),
    };
  }
}

export async function duplicateSearchProfileAction(
  profileId: string,
): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    const created = await repositories.searchProfiles.duplicate(profileId);
    if (!created) return { ok: false, error: "Perfil não encontrado." };
    revalidatePath("/settings/searches");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError("action.duplicateSearchProfile", error, "Erro ao duplicar."),
    };
  }
}

export async function deleteSearchProfileAction(
  profileId: string,
): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    await repositories.searchProfiles.softDelete(profileId);
    revalidatePath("/settings/searches");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError("action.deleteSearchProfile", error, "Erro ao excluir."),
    };
  }
}

export interface RunSearchActionResult extends ActionResult {
  summary?: {
    status: string;
    requested: number;
    resultsSeen: number;
    newCompanies: number;
    duplicates: number;
    suppressed: number;
    failedItems: number;
    noPhone: number;
    reusedExistingRun: boolean;
  };
}

/** Executa a coleta de um perfil agora (RF-03 "Executar agora"). */
export async function runSearchAction(
  profileId: string,
): Promise<RunSearchActionResult> {
  try {
    const { services } = await createServerContext();
    const result = await services.collection.runSearch({
      profileId,
      trigger: "manual",
    });
    revalidatePath("/settings/searches");
    revalidatePath(`/settings/searches/${profileId}`);
    revalidatePath("/opportunities");
    revalidatePath("/");
    if (result.error) return { ok: false, error: result.error };
    return {
      ok: true,
      summary: {
        status: result.status,
        requested: result.requested,
        resultsSeen: result.resultsSeen,
        newCompanies: result.newCompanies,
        duplicates: result.duplicates,
        suppressed: result.suppressed,
        failedItems: result.failedItems,
        noPhone: result.noPhone,
        reusedExistingRun: result.reusedExistingRun,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        toActionError("action.runSearch", error, "Erro ao executar a coleta."),
    };
  }
}

/** Simula a coleta sem persistir ("Testar configuração", Blueprint §12.6). */
export async function testSearchProfileAction(
  profileId: string,
): Promise<RunSearchActionResult> {
  try {
    const { services } = await createServerContext();
    const result = await services.collection.runSearch({
      profileId,
      trigger: "manual",
      dryRun: true,
    });
    if (result.error) return { ok: false, error: result.error };
    return {
      ok: true,
      summary: {
        status: result.status,
        requested: result.requested,
        resultsSeen: result.resultsSeen,
        newCompanies: result.newCompanies,
        duplicates: result.duplicates,
        suppressed: result.suppressed,
        failedItems: result.failedItems,
        noPhone: result.noPhone,
        reusedExistingRun: result.reusedExistingRun,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        toActionError("action.testSearchProfile", error, "Erro ao testar o perfil."),
    };
  }
}

export async function toggleSearchProfileStatusAction(
  id: string,
  current: SearchProfileStatus,
): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    await repositories.searchProfiles.setStatus(
      id,
      current === "active" ? "paused" : "active",
    );
    revalidatePath("/settings/searches");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError("action.updateSearchProfileStatus", error, "Erro ao atualizar."),
    };
  }
}
