"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import {
  templateInputSchema,
  updateTemplateInputSchema,
  ALLOWED_TEMPLATE_VARIABLES,
} from "@/lib/validation/template";
import { MESSAGE_KIND_LABEL } from "@/lib/message-kind";
import type { ActionResult } from "@/server/actions/opportunities";
import type { MessageKind } from "@/types/domain";

/** Deriva as variáveis usadas no conteúdo, restritas às permitidas (§17.1). */
function deriveVariables(content: string): string[] {
  return ALLOWED_TEMPLATE_VARIABLES.filter((v) => content.includes(`{{${v}}}`));
}

function dupMessage(category: MessageKind): string {
  return `Já existe um template com esse nome ou conteúdo em “${MESSAGE_KIND_LABEL[category]}”.`;
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
    const duplicate = await repositories.templates.findDuplicate({
      category: input.category,
      name: input.name,
      content: input.content,
    });
    if (duplicate) return { ok: false, error: dupMessage(input.category) };
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

export async function updateTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const content = String(formData.get("content") ?? "");
    const input = updateTemplateInputSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      category: formData.get("category"),
      content,
      allowedVariables: deriveVariables(content),
    });
    const { repositories } = await createServerContext();
    const duplicate = await repositories.templates.findDuplicate({
      category: input.category,
      name: input.name,
      content: input.content,
      excludeId: input.id,
    });
    if (duplicate) return { ok: false, error: dupMessage(input.category) };
    await repositories.templates.update(input.id, {
      name: input.name,
      category: input.category,
      content: input.content,
      allowedVariables: input.allowedVariables,
    });
    revalidatePath("/messages/templates");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Erro ao editar template.",
    };
  }
}

/** Ativa/desativa um template sem removê-lo (§1). */
export async function setTemplateActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const { repositories } = await createServerContext();
    await repositories.templates.update(id, { active });
    revalidatePath("/messages/templates");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Erro ao atualizar template.",
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
