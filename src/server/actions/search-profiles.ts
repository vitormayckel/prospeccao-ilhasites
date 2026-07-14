"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { searchProfileInputSchema } from "@/lib/validation/search-profile";
import type { ActionResult } from "@/server/actions/opportunities";
import type { SearchProfileStatus } from "@/types/domain";

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
