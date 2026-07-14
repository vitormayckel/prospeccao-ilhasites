-- =====================================================================
-- Ilha Prospect — Migration 0001: schema inicial
-- Fonte: Blueprint v1 §15 (adaptado: single-tenant, sem organization_id).
-- Postgres. UUID como PK. timestamptz em UTC. Exclusão lógica via deleted_at.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Tipos enumerados (vocabulários controlados — Blueprint §14.6)
-- ---------------------------------------------------------------------
create type search_profile_status as enum ('active', 'paused');
create type search_run_trigger     as enum ('scheduled', 'manual');
create type search_run_status      as enum ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled');
create type whatsapp_status        as enum ('unknown', 'probable', 'confirmed', 'invalid');
create type review_status          as enum ('pending_analysis', 'analysis_failed', 'pending_review', 'approved', 'rejected', 'snoozed');
create type pipeline_stage         as enum ('new', 'analyzed', 'approved', 'first_contact', 'follow_up', 'negotiation', 'client', 'lost');
create type priority               as enum ('low', 'normal', 'high', 'urgent');
create type ai_status              as enum ('pending', 'running', 'completed', 'failed');
create type ai_potential           as enum ('very_high', 'high', 'medium', 'low', 'very_low');
create type ai_confidence          as enum ('high', 'medium', 'low');
create type decision_type          as enum ('approved', 'rejected', 'snoozed', 'reactivated');
create type message_kind           as enum ('first_contact', 'follow_up', 'reactivation', 'last_attempt');
create type message_status         as enum ('draft', 'opened', 'confirmed_sent', 'not_sent');
create type follow_up_status       as enum ('pending', 'completed', 'cancelled', 'replaced');
create type job_status             as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type integration_status     as enum ('not_configured', 'connected', 'error', 'disconnected');

-- ---------------------------------------------------------------------
-- profiles — operadores do sistema (link futuro com Supabase Auth)
-- ---------------------------------------------------------------------
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,
  display_name  text not null,
  email         text,
  role          text not null default 'operator',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- search_profiles — perfis de pesquisa recorrente
-- ---------------------------------------------------------------------
create table search_profiles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  status        search_profile_status not null default 'active',
  weekdays      smallint[] not null default '{1,2,3,4,5}',
  run_time      time not null default '07:00',
  timezone      text not null default 'America/Sao_Paulo',
  daily_limit   integer not null default 50 check (daily_limit > 0),
  radius_meters integer check (radius_meters is null or radius_meters > 0),
  min_rating    numeric(2,1) check (min_rating is null or (min_rating >= 0 and min_rating <= 5)),
  provider      text not null default 'google_places',
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table search_profile_locations (
  id                uuid primary key default gen_random_uuid(),
  search_profile_id uuid not null references search_profiles(id) on delete cascade,
  city              text not null,
  state             text not null,
  country_code      text not null default 'BR',
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_spl_profile on search_profile_locations(search_profile_id);

create table search_profile_categories (
  id                uuid primary key default gen_random_uuid(),
  search_profile_id uuid not null references search_profiles(id) on delete cascade,
  label             text not null,
  provider_category text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_spc_profile on search_profile_categories(search_profile_id);

-- ---------------------------------------------------------------------
-- search_runs — execuções de pesquisa (idempotentes)
-- ---------------------------------------------------------------------
create table search_runs (
  id                uuid primary key default gen_random_uuid(),
  search_profile_id uuid references search_profiles(id) on delete set null,
  idempotency_key   text not null unique,
  trigger_type      search_run_trigger not null,
  status            search_run_status not null default 'queued',
  started_at        timestamptz,
  finished_at       timestamptz,
  results_seen      integer not null default 0,
  new_companies     integer not null default 0,
  duplicates        integer not null default 0,
  failed_items      integer not null default 0,
  estimated_cost    numeric(10,4) not null default 0,
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_search_runs_profile on search_runs(search_profile_id);
create index idx_search_runs_status on search_runs(status, created_at desc);

-- ---------------------------------------------------------------------
-- companies — negócios locais coletados
-- ---------------------------------------------------------------------
create table companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  normalized_name  text not null,
  primary_category text,
  phone_raw        text,
  phone_e164       text,
  whatsapp_status  whatsapp_status not null default 'unknown',
  website_url      text,
  normalized_domain text,
  instagram_url    text,
  address_line     text,
  city             text,
  state            text,
  postal_code      text,
  country_code     text default 'BR',
  latitude         numeric(9,6),
  longitude        numeric(9,6),
  rating           numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  reviews_count    integer check (reviews_count is null or reviews_count >= 0),
  pipeline_stage   pipeline_stage not null default 'new',
  review_status    review_status not null default 'pending_analysis',
  priority         priority not null default 'normal',
  score            integer check (score is null or (score >= 0 and score <= 100)),
  next_action_at   timestamptz,
  owner_id         uuid references profiles(id) on delete set null,
  source_run_id    uuid references search_runs(id) on delete set null,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_companies_review on companies(review_status, created_at desc);
create index idx_companies_stage on companies(pipeline_stage);
create index idx_companies_next_action on companies(next_action_at);
create index idx_companies_priority on companies(priority);
create unique index uq_companies_phone on companies(phone_e164) where phone_e164 is not null and deleted_at is null;
create index idx_companies_domain on companies(normalized_domain) where normalized_domain is not null;
create index idx_companies_name_trgm on companies using gin (normalized_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- company_sources — proveniência (fonte + payload bruto)
-- ---------------------------------------------------------------------
create table company_sources (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  provider     text not null,
  external_id  text,
  source_url   text,
  raw_payload  jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_company_sources_company on company_sources(company_id);
create unique index uq_company_sources_provider_ext
  on company_sources(provider, external_id) where external_id is not null;

-- ---------------------------------------------------------------------
-- company_field_evidence — rastreabilidade campo a campo
-- ---------------------------------------------------------------------
create table company_field_evidence (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  field_name  text not null,
  value_text  text,
  source_id   uuid references company_sources(id) on delete set null,
  confidence  ai_confidence,
  observed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_cfe_company on company_field_evidence(company_id);

-- ---------------------------------------------------------------------
-- ai_analyses — análises de IA (contrato Blueprint §9.5)
-- ---------------------------------------------------------------------
create table ai_analyses (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  status           ai_status not null default 'pending',
  analysis_version text not null default '1.0',
  prompt_version   text,
  provider         text,
  model            text,
  input_snapshot   jsonb,
  output           jsonb,
  score            integer check (score is null or (score >= 0 and score <= 100)),
  potential        ai_potential,
  confidence       ai_confidence,
  tokens_input     integer,
  tokens_output    integer,
  cost_estimate    numeric(10,4) not null default 0,
  latency_ms       integer,
  error_message    text,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_ai_analyses_company on ai_analyses(company_id, created_at desc);
create index idx_ai_analyses_status on ai_analyses(status);

-- ---------------------------------------------------------------------
-- company_decisions — decisões humanas (auditáveis)
-- ---------------------------------------------------------------------
create table company_decisions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  profile_id      uuid references profiles(id) on delete set null,
  decision        decision_type not null,
  reason          text,
  notes           text,
  snoozed_until   timestamptz,
  previous_status review_status,
  new_status      review_status,
  created_at      timestamptz not null default now(),
  -- RN-07: adiar exige data futura
  constraint chk_snooze_requires_date
    check (decision <> 'snoozed' or snoozed_until is not null)
);
create index idx_decisions_company on company_decisions(company_id, created_at desc);

-- ---------------------------------------------------------------------
-- company_notes
-- ---------------------------------------------------------------------
create table company_notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_notes_company on company_notes(company_id, created_at desc);

-- ---------------------------------------------------------------------
-- message_templates
-- ---------------------------------------------------------------------
create table message_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category          message_kind not null,
  content           text not null,
  allowed_variables text[] not null default '{}',
  is_default        boolean not null default false,
  active            boolean not null default true,
  version           integer not null default 1,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_templates_category on message_templates(category) where deleted_at is null;

-- ---------------------------------------------------------------------
-- messages — preparação/confirmação de envio manual
-- ---------------------------------------------------------------------
create table messages (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  template_id  uuid references message_templates(id) on delete set null,
  profile_id   uuid references profiles(id) on delete set null,
  type         message_kind not null,
  channel      text not null default 'whatsapp',
  content      text not null,
  phone_e164   text,
  status       message_status not null default 'draft',
  opened_at    timestamptz,
  sent_at      timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_messages_company on messages(company_id, sent_at desc);
create index idx_messages_status on messages(status);

-- ---------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------
create table follow_ups (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  assigned_to  uuid references profiles(id) on delete set null,
  due_at       timestamptz not null,
  type         text not null default 'follow_up',
  notes        text,
  status       follow_up_status not null default 'pending',
  completed_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_followups_status_due on follow_ups(status, due_at);
create index idx_followups_company on follow_ups(company_id);

-- ---------------------------------------------------------------------
-- pipeline_events — histórico de movimentações
-- ---------------------------------------------------------------------
create table pipeline_events (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  from_stage pipeline_stage,
  to_stage   pipeline_stage not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index idx_pipeline_events_company on pipeline_events(company_id, created_at desc);

-- ---------------------------------------------------------------------
-- audit_events — trilha de auditoria (sem segredos)
-- ---------------------------------------------------------------------
create table audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_entity on audit_events(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- integration_settings — metadados de integrações (segredos ficam em env)
-- ---------------------------------------------------------------------
create table integration_settings (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null unique,
  status          integration_status not null default 'not_configured',
  config          jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- job_queue — fila de jobs em background (idempotente)
-- ---------------------------------------------------------------------
create table job_queue (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null,
  entity_id       uuid,
  status          job_status not null default 'queued',
  idempotency_key text unique,
  payload         jsonb not null default '{}'::jsonb,
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_job_queue_status on job_queue(status, run_after);

-- ---------------------------------------------------------------------
-- suppression_list — bloqueio LGPD (preparação para operação real)
-- ---------------------------------------------------------------------
create table suppression_list (
  id                uuid primary key default gen_random_uuid(),
  phone_e164        text,
  normalized_domain text,
  reason            text,
  created_at        timestamptz not null default now(),
  constraint chk_suppression_target
    check (phone_e164 is not null or normalized_domain is not null)
);
create index idx_suppression_phone on suppression_list(phone_e164) where phone_e164 is not null;
create index idx_suppression_domain on suppression_list(normalized_domain) where normalized_domain is not null;
