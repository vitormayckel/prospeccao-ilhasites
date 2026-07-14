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

export const templateInputSchema = z.object({
  name: z.string().min(1).max(120),
  category: messageKindEnum,
  content: z.string().min(1).max(4000),
  allowedVariables: z.array(z.enum(ALLOWED_TEMPLATE_VARIABLES)).default([]),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const updateTemplateInputSchema = templateInputSchema
  .partial()
  .extend({ id: uuid });
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;
