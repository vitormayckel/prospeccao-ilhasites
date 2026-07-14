import type { AdminClient } from "@/lib/database/supabase-admin";
import type {
  CompanyDecisionRow,
  DecisionType,
  ReviewStatus,
} from "@/types/domain";

export interface AddDecisionInput {
  companyId: string;
  profileId?: string | null;
  decision: DecisionType;
  reason?: string | null;
  notes?: string | null;
  snoozedUntil?: string | null;
  previousStatus?: ReviewStatus | null;
  newStatus?: ReviewStatus | null;
}

export function createDecisionsRepository(db: AdminClient) {
  return {
    async add(input: AddDecisionInput): Promise<CompanyDecisionRow> {
      const { data, error } = await db
        .from("company_decisions")
        .insert({
          company_id: input.companyId,
          profile_id: input.profileId ?? null,
          decision: input.decision,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          snoozed_until: input.snoozedUntil ?? null,
          previous_status: input.previousStatus ?? null,
          new_status: input.newStatus ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async listByCompany(companyId: string): Promise<CompanyDecisionRow[]> {
      const { data, error } = await db
        .from("company_decisions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  };
}

export type DecisionsRepository = ReturnType<typeof createDecisionsRepository>;
