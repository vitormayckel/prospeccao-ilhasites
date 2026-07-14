-- =====================================================================
-- Ilha Prospect — Migration 0002: Row Level Security
-- Blueprint RNF-11 / §18: RLS habilitado em todas as tabelas.
--
-- Nesta versão (interna, sem auth de usuário final), NÃO há policies:
-- o padrão do Postgres com RLS habilitado e sem policy é NEGAR tudo
-- para papéis comuns (anon/authenticated). Todo acesso ocorre no servidor
-- via service role, que ignora RLS por padrão (Blueprint §18.1).
--
-- Quando a autenticação de operador for adicionada, criar policies
-- baseadas em auth.uid() aqui, sem alterar a camada de dados.
-- =====================================================================

alter table profiles                  enable row level security;
alter table search_profiles           enable row level security;
alter table search_profile_locations  enable row level security;
alter table search_profile_categories enable row level security;
alter table search_runs                enable row level security;
alter table companies                  enable row level security;
alter table company_sources            enable row level security;
alter table company_field_evidence     enable row level security;
alter table ai_analyses                enable row level security;
alter table company_decisions          enable row level security;
alter table company_notes              enable row level security;
alter table message_templates          enable row level security;
alter table messages                   enable row level security;
alter table follow_ups                 enable row level security;
alter table pipeline_events            enable row level security;
alter table audit_events               enable row level security;
alter table integration_settings       enable row level security;
alter table job_queue                  enable row level security;
alter table suppression_list           enable row level security;
