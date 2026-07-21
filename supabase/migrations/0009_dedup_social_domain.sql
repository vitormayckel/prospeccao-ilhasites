-- =====================================================================
-- Ilha Prospect — Migration 0009: domínio deixa de ser identidade única
--
-- MOTIVO (bug encontrado em execução real do pipeline):
-- o Google Places devolve o perfil da rede social em `websiteUri` quando o
-- negócio não tem site próprio. A deduplicação tratava isso como domínio,
-- e empresas distintas colapsavam num único registro — observado com 14
-- negócios diferentes de Vitória, Vila Velha, Cariacica e Serra fundidos por
-- "instagram.com". São leads reais perdidos.
--
-- A correção principal é no código (normalizeOwnDomain devolve null para
-- redes sociais). Esta migration corrige o reforço que a 0008 havia criado:
-- o índice ÚNICO em normalized_domain era forte demais. Domínio compartilhado
-- legítimo existe (redes de clínicas, franquias), e um índice único impede a
-- inserção dessas empresas em vez de apenas sinalizá-las.
--
-- Domínio volta a ser CONSULTA de deduplicação, não restrição de banco.
-- A identidade forte continua protegida por índices únicos:
--   uq_company_sources_provider_ext  (provider + place ID)
--   uq_companies_phone               (telefone E.164)
--
-- Aditiva e não destrutiva: nenhuma linha é alterada ou removida.
-- =====================================================================

-- §1 Remove a restrição única criada pela 0008.
drop index if exists uq_companies_domain_active;

-- §2 Índice comum equivalente, para a consulta de dedup continuar barata.
create index if not exists idx_companies_domain_active
  on companies(normalized_domain)
  where normalized_domain is not null and deleted_at is null;

-- =====================================================================
-- ROLLBACK (só é seguro se não houver domínios repetidos):
--   drop index if exists idx_companies_domain_active;
--   create unique index uq_companies_domain_active
--     on companies(normalized_domain)
--     where normalized_domain is not null and deleted_at is null;
-- =====================================================================
