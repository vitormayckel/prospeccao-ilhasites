"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import {
  templateInputSchema,
  ALLOWED_TEMPLATE_VARIABLES,
} from "@/lib/validation/template";
import type { ActionResult } from "@/server/actions/opportunities";

/** Deriva as variáveis usadas no conteúdo, restritas às permitidas (§17.1). */
function deriveVariables(content: string): string[] {
  return ALLOWED_TEMPLATE_VARIABLES.filter((v) => content.includes(`{{${v}}}`));
}

export async function createTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const content = String(formData.get("content") ?? "");
    const input = templateInputSchema.parse({
      name: formData.get("name"),
      category: formData.get("category"),
      content,
      allowedVariables: deriveVariables(content),
      isDefault: false,
      active: true,
    });
    const { repositories } = await createServerContext();
    await repositories.templates.create({
      name: input.name,
      category: input.category,
      content: input.content,
      allowedVariables: input.allowedVariables,
      isDefault: input.isDefault,
      active: input.active,
    });
    revalidatePath("/messages/templates");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao criar template.",
    };
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    await repositories.templates.softDelete(id);
    revalidatePath("/messages/templates");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Erro ao excluir template.",
    };
  }
}
