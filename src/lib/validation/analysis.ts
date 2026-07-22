import { z } from "zod";
import {
  AI_POTENTIAL,
  AI_CONFIDENCE,
  type ProspectAnalysis,
} from "@/types/domain";

const evidenceItem = z.object({
  text: z.string().min(1),
  evidence_refs: z.array(z.string()),
});

/**
 * Schema do contrato de saída da IA (Blueprint §9.5).
 * Preparado para a Fase 4: valida a resposta do provedor antes de persistir.
 */
export const prospectAnalysisSchema: z.ZodType<ProspectAnalysis> = z.object({
  version: z.literal("1.0"),
  recommendation: z.enum(["prioritize", "review", "low_priority"]),
  score: z.number().int().min(0).max(100),
  potential: z.enum(AI_POTENTIAL),
  confidence: z.enum(AI_CONFIDENCE),
  commercial_score: z.number().int().min(0).max(100),
  website_assessment: z.object({
    class: z.enum(["very_poor", "reasonable", "professional"]),
    reasons: z.array(z.string()),
  }),
  commercial_factors: z.array(
    z.object({
      code: z.string().min(1),
      label: z.string().min(1),
      effect: z.enum(["+", "-", "="]),
    }),
  ),
  executive_summary: z.string().min(1),
  score_breakdown: z.array(
    z.object({
      dimension: z.string().min(1),
      points: z.number().min(0),
      max_points: z.number().min(0),
      explanation: z.string(),
      evidence_refs: z.array(z.string()),
    }),
  ),
  positives: z.array(evidenceItem),
  risks: z.array(evidenceItem),
  opportunities: z.array(evidenceItem),
  sales_arguments: z.array(evidenceItem),
  missing_data: z.array(z.string()),
  cautions: z.array(z.string()),
});
