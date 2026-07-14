import { z } from "zod";
import { uuid, searchProfileStatusEnum } from "@/lib/validation/common";

export const searchProfileLocationSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  countryCode: z.string().length(2).default("BR"),
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
