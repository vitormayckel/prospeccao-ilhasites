-- =====================================================================
-- Ilha Prospect — Migration 0007: pipeline de prospecção como job persistente
--
-- Transforma busca + análise num único fluxo retomável, executado por ticks
-- curtos no servidor. O progresso vive no banco: reiniciar a função, fechar a
-- aba ou estourar o timeout da Vercel não interrompe a execução.
--
-- Aditiva e reversível:
--   - NÃO altera o enum job_status existente (dados atuais permanecem válidos);
--     as fases finas vão para a coluna nova `phase`, com enum próprio;
--   - NÃO apaga empresas, análises, decisões ou histórico;
--   - todas as colunas novas são nullable ou têm default.
--
-- Rollback: ver bloco comentado ao final.
-- =====================================================================

-- §1 Fases explícitas do pipeline (máquina de estados persistida).
-- Separadas de job_status de propósito: job_status descreve o ciclo de vida do
-- job (queued/running/completed/failed/cancelled) e continua compatível com as
-- linhas já existentes; job_phase descreve ONDE dentro do pipeline ele está.
-- Guardado para a migration poder ser reaplicada com segurança:
-- `create type` não aceita IF NOT EXISTS.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_phase') then
    create type job_phase as enum (
      'SEARCH',
      'NORMALIZE',
      'DEDUP',
      'ANALYZE',
      'QUALIFY',
      'SEARCH_REPLACEMENTS',
      'FINISHED'
    );
  end if;
end
$$;

-- §2 job_queue ganha lock com expiração, cursor e contadores de transparência.
alter table job_queue
  add column if not exists phase             job_phase   not null default 'SEARCH',
  add column if not exists locked_by         text,
  add column if not exists lock_expires_at   timestamptz,
  add column if not exists started_at        timestamptz,
  add column if not exists finished_at       timestamptz,
  add column if not exists search_profile_id uuid references search_profiles(id) on delete set null,
  add column if not exists search_run_id     uuid references search_runs(id) on delete set null,
  -- detalhe técnico interno; `last_error` continua sendo o resumo exibível
  add column if not exists error_detail      text,
  -- cursor de retomada: combinação (cidade×termo) e página correntes
  add column if not exists cursor_combo      integer     not null default 0,
  add column if not exists cursor_page       integer     not null default 0,
  add column if not exists current_city      text,
  add column if not exists current_state     text,
  add column if not exists current_term      text,
  -- meta e contadores (§4/§8 — explicar por que a meta não foi atingida)
  add column if not exists target_qualified  integer     not null default 0,
  add column if not exists results_raw       integer     not null default 0,
  add column if not exists count_new         integer     not null default 0,
  add column if not exists count_existing    integer     not null default 0,
  add column if not exists count_duplicate   integer     not null default 0,
  add column if not exists count_invalid     integer     not null default 0,
  add column if not exists count_suppressed  integer     not null default 0,
  add column if not exists count_analyzed    integer     not null default 0,
  add column if not exists count_qualified   integer     not null default 0,
  add column if not exists count_disqualified integer    not null default 0,
  add column if not exists count_failed      integer     not null default 0,
  add column if not exists count_replacements integer    not null default 0,
  -- tetos de segurança contra custo descontrolado (§4)
  add column if not exists max_provider_calls integer    not null default 60,
  add column if not exists max_ai_calls       integer    not null default 200,
  add column if not exists used_provider_calls integer   not null default 0,
  add column if not exists used_ai_calls      integer    not null default 0,
  add column if not exists deadline_at        timestamptz,
  -- motivo estruturado de encerramento sem atingir a meta
  add column if not exists finish_reason      text;

-- Claim: busca o próximo job elegível (fila ou lock expirado).
create index if not exists idx_job_queue_claim
  on job_queue(status, run_after)
  where status in ('queued', 'running');

-- Varredura de locks expirados (Cron diário de recovery).
create index if not exists idx_job_queue_lock_expiry
  on job_queue(lock_expires_at)
  where lock_expires_at is not null;

create index if not exists idx_job_queue_profile on job_queue(search_profile_id);

-- §3 job_candidates — área de estágio entre SEARCH e ANALYZE.
--
-- Existe para que os resultados do provedor sobrevivam entre ticks e para que
-- uma página reprocessada após falha não gere empresa nem análise duplicada.
-- É aqui que a deduplicação acontece ANTES de qualquer custo de IA (§7).
create table if not exists job_candidates (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references job_queue(id) on delete cascade,
  provider      text not null,
  external_id   text,
  -- normalized: candidato já normalizado; raw_payload: proveniência
  normalized    jsonb not null default '{}'::jsonb,
  raw_payload   jsonb not null default '{}'::jsonb,
  -- pending_normalize -> pending_dedup -> new | existing | duplicate
  --                                    | suppressed | invalid
  stage         text not null default 'pending_normalize',
  company_id    uuid references companies(id) on delete set null,
  -- motivo real da exclusão, exibido no resumo da execução (§8)
  reason        text,
  city          text,
  state         text,
  term          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotência: o mesmo place ID nunca é processado duas vezes no mesmo job,
-- mesmo que a página seja refeita após uma falha. Também é a deduplicação
-- DENTRO da mesma execução (§7).
create unique index if not exists uq_job_candidates_external
  on job_candidates(job_id, provider, external_id)
  where external_id is not null;

create index if not exists idx_job_candidates_stage
  on job_candidates(job_id, stage);

-- Mesma convenção da 0003: updated_at coerente mesmo em escrita externa.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_job_candidates_updated_at'
  ) then
    create trigger trg_job_candidates_updated_at
      before update on job_candidates
      for each row execute function set_updated_at();
  end if;
end
$$;

-- §4 RLS na mesma convenção da 0002: habilitado e SEM policy — o padrão do
-- Postgres nega tudo para anon/authenticated, e o acesso ocorre no servidor
-- via service role, que ignora RLS. Não criar policy aqui mantém a coerência
-- com as demais tabelas.
alter table job_candidates enable row level security;

-- =====================================================================
-- ROLLBACK (aplicar na ordem inversa; nenhum dado de domínio é perdido):
--
--   drop table if exists job_candidates;
--   alter table job_queue
--     drop column if exists phase,
--     drop column if exists locked_by,
--     drop column if exists lock_expires_at,
--     drop column if exists started_at,
--     drop column if exists finished_at,
--     drop column if exists search_profile_id,
--     drop column if exists search_run_id,
--     drop column if exists error_detail,
--     drop column if exists cursor_combo,
--     drop column if exists cursor_page,
--     drop column if exists current_city,
--     drop column if exists current_state,
--     drop column if exists current_term,
--     drop column if exists target_qualified,
--     drop column if exists results_raw,
--     drop column if exists count_new,
--     drop column if exists count_existing,
--     drop column if exists count_duplicate,
--     drop column if exists count_invalid,
--     drop column if exists count_suppressed,
--     drop column if exists count_analyzed,
--     drop column if exists count_qualified,
--     drop column if exists count_disqualified,
--     drop column if exists count_failed,
--     drop column if exists count_replacements,
--     drop column if exists max_provider_calls,
--     drop column if exists max_ai_calls,
--     drop column if exists used_provider_calls,
--     drop column if exists used_ai_calls,
--     drop column if exists deadline_at,
--     drop column if exists finish_reason;
--   drop type if exists job_phase;
-- =====================================================================
