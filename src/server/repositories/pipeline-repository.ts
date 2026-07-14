import type { AdminClient } from "@/lib/database/supabase-admin";
import type { PipelineEventRow, PipelineStage } from "@/types/domain";

export function createPipelineRepository(db: AdminClient) {
  return {
    async addEvent(input: {
      companyId: string;
      fromStage: PipelineStage | null;
      toStage: PipelineStage;
      reason?: string | null;
      profileId?: string | null;
    }): Promise<PipelineEventRow> {
      const { data, error } = await db
        .from("pipeline_events")
        .insert({
          company_id: input.companyId,
          from_stage: input.fromStage,
          to_stage: input.toStage,
          reason: input.reason ?? null,
          profile_id: input.profileId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async listByCompany(companyId: string): Promise<PipelineEventRow[]> {
      const { data, error } = await db
        .from("pipeline_events")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  };
}

export type PipelineRepository = ReturnType<typeof createPipelineRepository>;
