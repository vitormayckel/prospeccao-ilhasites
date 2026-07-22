-- =====================================================================
-- Ilha Prospect — Migration 0011: classificação de website e score comercial
--
-- Aditiva e não-destrutiva: apenas colunas ANULÁVEIS em companies e um novo
-- enum. Não altera colunas, índices ou comportamento existentes. Linhas
-- antigas ficam com website_class/commercial_score NULL ("não classificado"),
-- tratado com naturalidade pela interface.
--
-- Decisões (aprovadas):
--  - website_class: classificação do site (A=none, B=very_poor, C=reasonable,
--    D=professional). A prioridade comercial A/B/C/D é DERIVADA daqui (mapa
--    puro em código), sem coluna redundante.
--  - commercial_score (0–100): ranking primário da fila de oportunidades.
--    Calculado pela IA (domínio próprio) ou por regra determinística (sem
--    site) — a origem fica em commercial_scored_by, para auditoria.
--  - commercial_factors: explicabilidade do score (inclui market_competitiveness).
--  - Separado do `score` analítico da IA (breakdown), que permanece intocado.
-- =====================================================================

create type website_class as enum (
  'none',        -- sem domínio próprio (sem site ou apenas rede social) → Prioridade A
  'very_poor',   -- site muito ruim → Prioridade B
  'reasonable',  -- site razoável → Prioridade C
  'professional' -- site profissional → Prioridade D
);

alter table companies
  add column website_class        website_class,
  add column commercial_score     integer
    check (commercial_score is null or (commercial_score >= 0 and commercial_score <= 100)),
  add column commercial_factors   jsonb not null default '[]'::jsonb,
  add column commercial_scored_at timestamptz,
  add column commercial_scored_by text
    check (commercial_scored_by is null or commercial_scored_by in ('prefilter', 'ai'));

-- Ordenação primária da fila de oportunidades é por commercial_score desc.
create index idx_companies_commercial_score
  on companies(commercial_score desc)
  where deleted_at is null;

-- Filtro/agregação por classe de site (ex.: competitividade de mercado).
create index idx_companies_website_class
  on companies(website_class)
  where deleted_at is null;
