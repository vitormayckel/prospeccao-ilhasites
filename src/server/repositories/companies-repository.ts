import type { AdminClient } from "@/lib/database/supabase-admin";
import type { UpdateDto } from "@/types/database";
import type {
  CompanyRow,
  PipelineStage,
  Priority,
  ReviewStatus,
} from "@/types/domain";
import type { OpportunityFilters } from "@/lib/validation/company";

export interface CompanyDetail {
  company: CompanyRow;
  sources: unknown[];
  analyses: unknown[];
  decisions: unknown[];
  notes: unknown[];
  messages: unknown[];
  followUps: unknown[];
  pipelineEvents: unknown[];
}

/** Acesso a `companies` e agregados relacionados. */
export function createCompaniesRepository(db: AdminClient) {
  const repo = {
    async list(filters: OpportunityFilters): Promise<CompanyRow[]> {
      let query = db
        .from("companies")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(filters.limit);

      if (filters.reviewStatus)
        query = query.eq("review_status", filters.reviewStatus);
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.stage) query = query.eq("pipeline_stage", filters.stage);
      if (filters.city) query = query.ilike("city", `%${filters.city}%`);
      if (filters.search)
        query = query.ilike(
          "normalized_name",
          `%${filters.search.toLowerCase()}%`,
        );

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async findById(id: string): Promise<CompanyRow | null> {
      const { data, error } = await db
        .from("companies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Detalhe consolidado com todas as relações (Blueprint RF-16). */
    async getDetail(id: string): Promise<CompanyDetail | null> {
      const company = await repo.findById(id);
      if (!company) return null;

      const [sources, analyses, decisions, notes, messages, followUps, events] =
        await Promise.all([
          db.from("company_sources").select("*").eq("company_id", id),
          db
            .from("ai_analyses")
            .select("*")
            .eq("company_id", id)
            .order("created_at", { ascending: false }),
          db
            .from("company_decisions")
            .select("*")
            .eq("company_id", id)
            .order("created_at", { ascending: false }),
          db
            .from("company_notes")
            .select("*")
            .eq("company_id", id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          db
            .from("messages")
            .select("*")
            .eq("company_id", id)
            .order("created_at", { ascending: false }),
          db
            .from("follow_ups")
            .select("*")
            .eq("company_id", id)
            .is("deleted_at", null)
            .order("due_at", { ascending: true }),
          db
            .from("pipeline_events")
            .select("*")
            .eq("company_id", id)
            .order("created_at", { ascending: false }),
        ]);

      return {
        company,
        sources: sources.data ?? [],
        analyses: analyses.data ?? [],
        decisions: decisions.data ?? [],
        notes: notes.data ?? [],
        messages: messages.data ?? [],
        followUps: followUps.data ?? [],
        pipelineEvents: events.data ?? [],
      };
    },

    async updateReviewAndStage(
      id: string,
      values: {
        reviewStatus?: ReviewStatus;
        pipelineStage?: PipelineStage;
        nextActionAt?: string | null;
        score?: number | null;
      },
    ): Promise<CompanyRow> {
      const patch: UpdateDto<"companies"> = {};
      if (values.reviewStatus !== undefined)
        patch.review_status = values.reviewStatus;
      if (values.pipelineStage !== undefined)
        patch.pipeline_stage = values.pipelineStage;
      if (values.nextActionAt !== undefined)
        patch.next_action_at = values.nextActionAt;
      if (values.score !== undefined) patch.score = values.score;

      const { data, error } = await db
        .from("companies")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async setPriority(id: string, priority: Priority): Promise<CompanyRow> {
      const { data, error } = await db
        .from("companies")
        .update({ priority })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  };

  return repo;
}

export type CompaniesRepository = ReturnType<typeof createCompaniesRepository>;
