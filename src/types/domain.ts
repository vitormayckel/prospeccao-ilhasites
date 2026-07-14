// =====================================================================
// Tipos de domínio do Ilha Prospect — espelham o schema (migration 0001).
// Enums como const + união literal (Blueprint §14.6).
// =====================================================================

export const SEARCH_PROFILE_STATUS = ["active", "paused"] as const;
export type SearchProfileStatus = (typeof SEARCH_PROFILE_STATUS)[number];

export const SEARCH_RUN_TRIGGER = ["scheduled", "manual"] as const;
export type SearchRunTrigger = (typeof SEARCH_RUN_TRIGGER)[number];

export const SEARCH_RUN_STATUS = [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;
export type SearchRunStatus = (typeof SEARCH_RUN_STATUS)[number];

export const WHATSAPP_STATUS = [
  "unknown",
  "probable",
  "confirmed",
  "invalid",
] as const;
export type WhatsappStatus = (typeof WHATSAPP_STATUS)[number];

export const REVIEW_STATUS = [
  "pending_analysis",
  "analysis_failed",
  "pending_review",
  "approved",
  "rejected",
  "snoozed",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export const PIPELINE_STAGE = [
  "new",
  "analyzed",
  "approved",
  "first_contact",
  "follow_up",
  "negotiation",
  "client",
  "lost",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGE)[number];

export const PRIORITY = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITY)[number];

export const AI_STATUS = ["pending", "running", "completed", "failed"] as const;
export type AiStatus = (typeof AI_STATUS)[number];

export const AI_POTENTIAL = [
  "very_high",
  "high",
  "medium",
  "low",
  "very_low",
] as const;
export type AiPotential = (typeof AI_POTENTIAL)[number];

export const AI_CONFIDENCE = ["high", "medium", "low"] as const;
export type AiConfidence = (typeof AI_CONFIDENCE)[number];

export const DECISION_TYPE = [
  "approved",
  "rejected",
  "snoozed",
  "reactivated",
] as const;
export type DecisionType = (typeof DECISION_TYPE)[number];

export const MESSAGE_KIND = [
  "first_contact",
  "follow_up",
  "reactivation",
  "last_attempt",
] as const;
export type MessageKind = (typeof MESSAGE_KIND)[number];

export const MESSAGE_STATUS = [
  "draft",
  "opened",
  "confirmed_sent",
  "not_sent",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUS)[number];

export const FOLLOW_UP_STATUS = [
  "pending",
  "completed",
  "cancelled",
  "replaced",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[number];

export const JOB_STATUS = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const INTEGRATION_STATUS = [
  "not_configured",
  "connected",
  "error",
  "disconnected",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUS)[number];

// ---------------------------------------------------------------------
// Contrato de saída da IA (Blueprint §9.5) — usado em ai_analyses.output
// ---------------------------------------------------------------------
export type ProspectAnalysis = {
  version: "1.0";
  recommendation: "prioritize" | "review" | "low_priority";
  score: number;
  potential: AiPotential;
  confidence: AiConfidence;
  executive_summary: string;
  score_breakdown: Array<{
    dimension: string;
    points: number;
    max_points: number;
    explanation: string;
    evidence_refs: string[];
  }>;
  positives: Array<{ text: string; evidence_refs: string[] }>;
  risks: Array<{ text: string; evidence_refs: string[] }>;
  opportunities: Array<{ text: string; evidence_refs: string[] }>;
  sales_arguments: Array<{ text: string; evidence_refs: string[] }>;
  missing_data: string[];
  cautions: string[];
};

// ---------------------------------------------------------------------
// Linhas das tabelas (shape retornado do banco)
// ---------------------------------------------------------------------
type Timestamps = { created_at: string; updated_at: string };

export type ProfileRow = Timestamps & {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  email: string | null;
  role: string;
};

export type SearchProfileRow = Timestamps & {
  id: string;
  name: string;
  status: SearchProfileStatus;
  weekdays: number[];
  run_time: string;
  timezone: string;
  daily_limit: number;
  radius_meters: number | null;
  min_rating: number | null;
  provider: string;
  last_run_at: string | null;
  next_run_at: string | null;
  deleted_at: string | null;
};

export type SearchProfileLocationRow = Timestamps & {
  id: string;
  search_profile_id: string;
  city: string;
  state: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
};

export type SearchProfileCategoryRow = Timestamps & {
  id: string;
  search_profile_id: string;
  label: string;
  provider_category: string | null;
  active: boolean;
};

export type SearchRunRow = Timestamps & {
  id: string;
  search_profile_id: string | null;
  idempotency_key: string;
  trigger_type: SearchRunTrigger;
  status: SearchRunStatus;
  started_at: string | null;
  finished_at: string | null;
  results_seen: number;
  new_companies: number;
  duplicates: number;
  failed_items: number;
  estimated_cost: number;
  error_code: string | null;
  error_message: string | null;
};

export type CompanyRow = Timestamps & {
  id: string;
  name: string;
  normalized_name: string;
  primary_category: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  whatsapp_status: WhatsappStatus;
  website_url: string | null;
  normalized_domain: string | null;
  instagram_url: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews_count: number | null;
  pipeline_stage: PipelineStage;
  review_status: ReviewStatus;
  priority: Priority;
  score: number | null;
  next_action_at: string | null;
  owner_id: string | null;
  source_run_id: string | null;
  deleted_at: string | null;
};

export type CompanySourceRow = Timestamps & {
  id: string;
  company_id: string;
  provider: string;
  external_id: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown>;
  collected_at: string;
  last_seen_at: string;
};

export type AiAnalysisRow = Timestamps & {
  id: string;
  company_id: string;
  status: AiStatus;
  analysis_version: string;
  prompt_version: string | null;
  provider: string | null;
  model: string | null;
  input_snapshot: Record<string, unknown> | null;
  output: ProspectAnalysis | null;
  score: number | null;
  potential: AiPotential | null;
  confidence: AiConfidence | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_estimate: number;
  latency_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type CompanyDecisionRow = {
  id: string;
  company_id: string;
  profile_id: string | null;
  decision: DecisionType;
  reason: string | null;
  notes: string | null;
  snoozed_until: string | null;
  previous_status: ReviewStatus | null;
  new_status: ReviewStatus | null;
  created_at: string;
};

export type CompanyNoteRow = Timestamps & {
  id: string;
  company_id: string;
  profile_id: string | null;
  content: string;
  deleted_at: string | null;
};

export type MessageTemplateRow = Timestamps & {
  id: string;
  name: string;
  category: MessageKind;
  content: string;
  allowed_variables: string[];
  is_default: boolean;
  active: boolean;
  version: number;
  deleted_at: string | null;
};

export type MessageRow = Timestamps & {
  id: string;
  company_id: string;
  template_id: string | null;
  profile_id: string | null;
  type: MessageKind;
  channel: string;
  content: string;
  phone_e164: string | null;
  status: MessageStatus;
  opened_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
};

export type FollowUpRow = Timestamps & {
  id: string;
  company_id: string;
  assigned_to: string | null;
  due_at: string;
  type: string;
  notes: string | null;
  status: FollowUpStatus;
  completed_at: string | null;
  deleted_at: string | null;
};

export type PipelineEventRow = {
  id: string;
  company_id: string;
  profile_id: string | null;
  from_stage: PipelineStage | null;
  to_stage: PipelineStage;
  reason: string | null;
  created_at: string;
};

export type IntegrationSettingRow = Timestamps & {
  id: string;
  provider: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  last_checked_at: string | null;
  last_error: string | null;
};

export type JobQueueRow = Timestamps & {
  id: string;
  job_type: string;
  entity_id: string | null;
  status: JobStatus;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  last_error: string | null;
};
