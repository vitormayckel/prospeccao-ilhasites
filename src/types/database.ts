// =====================================================================
// Tipo Database no formato esperado pelo supabase-js (generic).
// Montado a partir dos Rows de domínio. Insert/Update derivados.
// Regenerar via `supabase gen types` quando o projeto Supabase existir.
// =====================================================================

import type {
  ProfileRow,
  SearchProfileRow,
  SearchProfileLocationRow,
  SearchProfileCategoryRow,
  SearchRunRow,
  CompanyRow,
  CompanySourceRow,
  AiAnalysisRow,
  CompanyDecisionRow,
  CompanyNoteRow,
  MessageTemplateRow,
  MessageRow,
  FollowUpRow,
  PipelineEventRow,
  IntegrationSettingRow,
  JobQueueRow,
} from "@/types/domain";

type TableShape<Row, Req extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Partial<Row>, Req> & Pick<Row, Req>;
  Update: Partial<Row>;
  Relationships: [];
};

// Campos obrigatórios no Insert = colunas NOT NULL sem default.
type CompanyInsertReq = "name" | "normalized_name";

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow, "display_name">;
      search_profiles: TableShape<SearchProfileRow, "name">;
      search_profile_locations: TableShape<
        SearchProfileLocationRow,
        "search_profile_id" | "city" | "state"
      >;
      search_profile_categories: TableShape<
        SearchProfileCategoryRow,
        "search_profile_id" | "label"
      >;
      search_runs: TableShape<SearchRunRow, "idempotency_key" | "trigger_type">;
      companies: TableShape<CompanyRow, CompanyInsertReq>;
      company_sources: TableShape<CompanySourceRow, "company_id" | "provider">;
      ai_analyses: TableShape<AiAnalysisRow, "company_id">;
      company_decisions: TableShape<
        CompanyDecisionRow,
        "company_id" | "decision"
      >;
      company_notes: TableShape<CompanyNoteRow, "company_id" | "content">;
      message_templates: TableShape<
        MessageTemplateRow,
        "name" | "category" | "content"
      >;
      messages: TableShape<MessageRow, "company_id" | "type" | "content">;
      follow_ups: TableShape<FollowUpRow, "company_id" | "due_at">;
      pipeline_events: TableShape<PipelineEventRow, "company_id" | "to_stage">;
      integration_settings: TableShape<IntegrationSettingRow, "provider">;
      job_queue: TableShape<JobQueueRow, "job_type">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
