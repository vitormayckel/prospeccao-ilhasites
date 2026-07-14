import { z } from "zod";
import { uuid } from "@/lib/validation/common";

export const createFollowUpInputSchema = z.object({
  companyId: uuid,
  dueAt: z.coerce.date(),
  type: z.string().min(1).max(60).default("follow_up"),
  notes: z.string().max(2000).optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpInputSchema>;

export const completeFollowUpInputSchema = z.object({
  id: uuid,
});
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpInputSchema>;
