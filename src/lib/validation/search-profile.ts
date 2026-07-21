import { z } from "zod";
import { uuid, searchProfileStatusEnum } from "@/lib/validation/common";

/**
 * Localidade do perfil. A UF é obrigatória e validada como sigla de 2 letras
 * maiúsculas — não existe mais campo de texto livre com default "ES", que era
 * a causa de cidades de MG serem pesquisadas como ES.
 *
 * `ibgeCode` e `stateName` são opcionais para manter compatibilidade com
 * perfis antigos, que não os possuem. Perfis criados ou editados no formulário
 * novo sempre os preenchem, porque vêm da seleção estruturada.
 */
export const searchProfileLocationSchema = z.object({
  city: z.string().min(1).max(120),
  state: z
    .string()
    .length(2, "Selecione a cidade na lista para definir a UF.")
    .regex(/^[A-Z]{2}$/, "UF deve ser a sigla com 2 letras maiúsculas."),
  countryCode: z.string().length(2).default("BR"),
  ibgeCode: z.number().int().positive().optional(),
  stateName: z.string().max(60).optional(),
});

export const searchProfileCategorySchema = z.object({
  label: z.string().min(1).max(120),
  providerCategory: z.string().max(120).optional(),
});

export const searchProfileInputSchema = z.object({
  name: z.string().min(1).max(160),
  status: searchProfileStatusEnum.default("active"),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .default([1, 2, 3, 4, 5]),
  runTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM.")
    .default("07:00"),
  timezone: z.string().default("America/Sao_Paulo"),
  dailyLimit: z.number().int().min(1).max(500).default(50),
  radiusMeters: z.number().int().positive().optional(),
  minRating: z.number().min(0).max(5).optional(),
  locations: z.array(searchProfileLocationSchema).min(1),
  categories: z.array(searchProfileCategorySchema).min(1),
});
export type SearchProfileInput = z.infer<typeof searchProfileInputSchema>;

export const updateSearchProfileInputSchema = searchProfileInputSchema
  .partial()
  .extend({ id: uuid });
export type UpdateSearchProfileInput = z.infer<
  typeof updateSearchProfileInputSchema
>;
