import { z } from "zod";
import { uuid, messageKindEnum } from "@/lib/validation/common";

/** Variáveis permitidas nos templates (Blueprint §17.1). */
export const ALLOWED_TEMPLATE_VARIABLES = [
  "company_name",
  "first_name",
  "city",
  "category",
  "website_reference",
] as const;

/** Limite de caracteres da saudação inicial — mensagens curtas apenas (§1). */
export const GREETING_MAX_LENGTH = 60;

const templateShape = {
  name: z.string().min(1).max(120),
  category: messageKindEnum,
  content: z.string().min(1).max(4000),
  allowedVariables: z.array(z.enum(ALLOWED_TEMPLATE_VARIABLES)).default([]),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
};

/** Saudação inicial: curta, uma linha, sem links nem conteúdo comercial (§1). */
export function assertGreetingRules(
  data: { category: string; content: string },
  ctx: z.RefinementCtx,
): void {
  if (data.category !== "greeting") return;
  const content = data.content.trim();
  if (content.length > GREETING_MAX_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `A saudação deve ser curta (até ${GREETING_MAX_LENGTH} caracteres).`,
    });
  }
  if (/\n/.test(content)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: "A saudação deve ter uma única linha.",
    });
  }
  if (/https?:\/\/|\{\{/.test(content)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message:
        "A saudação não pode conter links ou variáveis — apenas o cumprimento.",
    });
  }
}

export const templateInputSchema = z
  .object(templateShape)
  .superRefine(assertGreetingRules);
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const updateTemplateInputSchema = z
  .object({
    id: uuid,
    name: templateShape.name,
    category: templateShape.category,
    content: templateShape.content,
    allowedVariables: templateShape.allowedVariables,
  })
  .superRefine(assertGreetingRules);
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;
