-- =====================================================================
-- Ilha Prospect — Migration 0010: tabelas de auditoria de backfill
--
-- Os scripts scripts/backfill-uf.mjs e scripts/backfill-unmerge-social.mjs
-- gravam aqui o estado ANTERIOR de cada linha que alteram, o que torna as
-- correções reversíveis (--rollback). Até esta migration as tabelas eram
-- criadas em tempo de execução pelos próprios scripts, ficando FORA do
-- schema versionado e — mais grave — SEM row level security, ao contrário
-- de todas as demais tabelas (Blueprint RNF-11 / §18).
--
-- Os scripts passam a exigir que estas tabelas já existam, em vez de
-- criá-las por conta própria.
-- =====================================================================

-- Correções de município/UF: guarda cidade e estado como estavam antes.
create table if not exists backfill_uf_audit (
  id          uuid primary key default gen_random_uuid(),
  table_name  text        not null,
  row_id      uuid        not null,
  old_city    text,
  old_state   text,
  new_city    text,
  new_state   text,
  new_ibge    integer,
  applied_at  timestamptz not null default now()
);

create index if not exists idx_backfill_uf_audit_row
  on backfill_uf_audit (table_name, row_id);

-- Desfusão de empresas indevidamente unificadas: registra para qual empresa
-- cada company_source foi movida, permitindo devolvê-la à origem.
create table if not exists unmerge_audit (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid        not null,
  from_company  uuid        not null,
  to_company    uuid        not null,
  external_id   text,
  company_name  text,
  applied_at    timestamptz not null default now()
);

create index if not exists idx_unmerge_audit_source
  on unmerge_audit (source_id);

-- RLS conforme 0002: habilitado e sem policy = nega tudo para anon e
-- authenticated. O acesso ocorre apenas no servidor, via service role.
alter table backfill_uf_audit enable row level security;
alter table unmerge_audit     enable row level security;
