import { z } from "zod";
import { uuid, priorityEnum, pipelineStageEnum } from "@/lib/validation/common";

/** Decisão humana sobre uma empresa (aprovar/rejeitar/adiar). */
export const decisionInputSchema = z
  .object({
    companyId: uuid,
    decision: z.enum(["approved", "rejected", "snoozed"]),
    reason: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    // RN-07: adiar exige data futura
    snoozedUntil: z.coerce.date().optional(),
  })
  .refine(
    (v) =>
      v.decision !== "snoozed" ||
      (v.snoozedUntil && v.snoozedUntil > new Date()),
    { message: "Adiar exige uma data futura.", path: ["snoozedUntil"] },
  );
export type DecisionInput = z.infer<typeof decisionInputSchema>;

export const reactivateInputSchema = z.object({
  companyId: uuid,
  reason: z.string().min(1, "Informe o motivo.").max(500),
});
export type ReactivateInput = z.infer<typeof reactivateInputSchema>;

export const setPriorityInputSchema = z.object({
  companyId: uuid,
  priority: priorityEnum,
});
export type SetPriorityInput = z.infer<typeof setPriorityInputSchema>;

export const movePipelineInputSchema = z.object({
  companyId: uuid,
  toStage: pipelineStageEnum,
  reason: z.string().max(500).optional(),
});
export type MovePipelineInput = z.infer<typeof movePipelineInputSchema>;

export const createNoteInputSchema = z.object({
  companyId: uuid,
  content: z.string().min(1, "A nota não pode ser vazia.").max(2000),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

/** Filtros, ordenação e paginação da fila de oportunidades (Blueprint RF-17). */
export const OPPORTUNITY_SORTS = [
  "priority",
  "score",
  "name",
  "created_at",
] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

export const opportunityFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  city: z.string().max(120).optional(),
  reviewStatus: z
    .enum(["pending_review", "approved", "snoozed", "rejected"])
    .optional(),
  priority: priorityEnum.optional(),
  stage: pipelineStageEnum.optional(),
  sort: z.enum(OPPORTUNITY_SORTS).default("priority"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OpportunityFilters = z.infer<typeof opportunityFiltersSchema>;
