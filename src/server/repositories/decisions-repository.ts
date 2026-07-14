import type { Db } from "@/lib/database/sql";
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

export function createDecisionsRepository(db: Db) {
  return {
    async add(input: AddDecisionInput): Promise<CompanyDecisionRow> {
      const rows = await db.query<CompanyDecisionRow>(
        `insert into company_decisions
           (company_id, profile_id, decision, reason, notes, snoozed_until, previous_status, new_status)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          input.companyId,
          input.profileId ?? null,
          input.decision,
          input.reason ?? null,
          input.notes ?? null,
          input.snoozedUntil ?? null,
          input.previousStatus ?? null,
          input.newStatus ?? null,
        ],
      );
      return rows[0]!;
    },
  };
}

export type DecisionsRepository = ReturnType<typeof createDecisionsRepository>;
