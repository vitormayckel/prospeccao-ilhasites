-- =====================================================================
-- Ilha Prospect — Migration 0008: município estruturado (cidade + UF)
--
-- Causa do problema: o formulário de perfil tinha UF como texto livre com
-- default "ES". Cidades de MG foram gravadas como ES e a consulta ao Google
-- Places virou "Betim, ES" — resultado errado, sem erro aparente.
--
-- Esta migration apenas ACRESCENTA a identificação oficial do município.
-- Nenhum dado é apagado ou reescrito aqui: a correção dos registros já
-- existentes é feita pelo backfill (scripts/backfill-uf.mjs), que roda em
-- modo relatório por padrão e só altera casos inequívocos.
--
-- Aditiva e reversível — ver rollback ao final.
-- =====================================================================

-- §1 Código IBGE e nome do estado nas localidades do perfil de pesquisa.
-- Nullable de propósito: perfis antigos continuam válidos e são preenchidos
-- gradualmente pelo backfill e pela edição no formulário novo.
alter table search_profile_locations
  add column if not exists ibge_code  integer,
  add column if not exists state_name text;

create index if not exists idx_spl_ibge
  on search_profile_locations(ibge_code)
  where ibge_code is not null;

-- Consulta do backfill e dos relatórios por cidade+UF.
create index if not exists idx_spl_city_state
  on search_profile_locations(lower(city), state);

-- §2 Mesma identificação nas empresas coletadas, para auditoria e dedup.
alter table companies
  add column if not exists ibge_code integer;

create index if not exists idx_companies_ibge
  on companies(ibge_code) where ibge_code is not null;

-- §3 Deduplicação reforçada (§7): nome normalizado + cidade + UF.
-- Índice NÃO único de propósito: homônimos legítimos existem (filiais,
-- franquias) e bloquear a inserção perderia empresa real. Serve para tornar
-- a checagem de similaridade barata antes de gastar análise de IA.
create index if not exists idx_companies_dedup_name_city_state
  on companies(normalized_name, lower(coalesce(city, '')), coalesce(state, ''))
  where deleted_at is null;

-- Telefone e domínio já têm proteção em 0001:
--   uq_companies_phone (único, parcial)  — telefone normalizado E.164
--   idx_companies_domain                 — domínio normalizado
--   uq_company_sources_provider_ext      — provider + external_id (place ID)
-- O único novo abaixo fecha a corrida entre execuções simultâneas para o
-- mesmo domínio, que antes só tinha índice não único.
create unique index if not exists uq_companies_domain_active
  on companies(normalized_domain)
  where normalized_domain is not null and deleted_at is null;

-- =====================================================================
-- ROLLBACK:
--   drop index if exists uq_companies_domain_active;
--   drop index if exists idx_companies_dedup_name_city_state;
--   drop index if exists idx_companies_ibge;
--   alter table companies drop column if exists ibge_code;
--   drop index if exists idx_spl_city_state;
--   drop index if exists idx_spl_ibge;
--   alter table search_profile_locations
--     drop column if exists ibge_code,
--     drop column if exists state_name;
-- =====================================================================
