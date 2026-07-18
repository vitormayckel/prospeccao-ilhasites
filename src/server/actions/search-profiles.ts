"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import {
  searchProfileInputSchema,
  updateSearchProfileInputSchema,
} from "@/lib/validation/search-profile";
import type { ActionResult } from "@/server/actions/opportunities";
import type { SearchProfileStatus } from "@/types/domain";

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    const state = String(formData.get("state") ?? "ES").toUpperCase();
    const cities = splitList(formData.get("cities"));
    const categories = splitList(formData.get("categories"));

    const input = searchProfileInputSchema.parse({
      name: formData.get("name"),
      runTime: formData.get("runTime") || "07:00",
      dailyLimit: Number(formData.get("dailyLimit") || 50),
      locations: cities.map((city) => ({ city, state, countryCode: "BR" })),
      categories: categories.map((label) => ({ label })),
    });

    const { repositories } = await createServerContext();
    await repositories.searchProfiles.create(input);
    revalidatePath("/settings/searches");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao criar perfil.",
    };
  }
}

export async function updateSearchProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const state = String(formData.get("state") ?? "ES").toUpperCase();
    const cities = splitList(formData.get("cities"));
    const categories = splitList(formData.get("categories"));
    const weekdays = parseWeekdays(formData.getAll("weekdays"));

    const input = updateSearchProfileInputSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      runTime: formData.get("runTime") || "07:00",
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      dailyLimit: Number(formData.get("dailyLimit") || 50),
      locations: cities.map((city) => ({ city, state, countryCode: "BR" })),
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
      error: error instanceof Error ? error.message : "Erro ao salvar perfil.",
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
      error: error instanceof Error ? error.message : "Erro ao duplicar.",
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
      error: error instanceof Error ? error.message : "Erro ao excluir.",
    };
  }
}

export interface RunSearchActionResult extends ActionResult {
  summary?: {
    status: string;
    resultsSeen: number;
    newCompanies: number;
    duplicates: number;
    suppressed: number;
    failedItems: number;
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
        resultsSeen: result.resultsSeen,
        newCompanies: result.newCompanies,
        duplicates: result.duplicates,
        suppressed: result.suppressed,
        failedItems: result.failedItems,
        reusedExistingRun: result.reusedExistingRun,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Erro ao executar a coleta.",
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
        resultsSeen: result.resultsSeen,
        newCompanies: result.newCompanies,
        duplicates: result.duplicates,
        suppressed: result.suppressed,
        failedItems: result.failedItems,
        reusedExistingRun: result.reusedExistingRun,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Erro ao testar o perfil.",
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
      error: error instanceof Error ? error.message : "Erro ao atualizar.",
    };
  }
}
