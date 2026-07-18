-- =====================================================================
-- Ilha Prospect — Migration 0006: operação comercial / CRM (Sprint 4)
-- Classificações operacionais que acompanham a oportunidade, para métricas
-- futuras por canal, interlocutor e próxima ação. NÃO altera fluxo de coleta,
-- de mensagens nem regras de negócio — apenas rótulos operacionais.
-- Aditiva e reversível (novos enums + colunas com default/nullable).
-- =====================================================================

-- §2 Canal de abordagem que acompanha a oportunidade (não é o canal por
-- mensagem, que segue em messages.channel). Default 'whatsapp' = canal padrão.
create type approach_channel as enum ('whatsapp', 'instagram');

-- §3 Com quem estamos falando na empresa (classificação do interlocutor).
create type contact_role as enum (
  'no_reply',    -- Não respondeu
  'reception',   -- Recepção
  'secretary',   -- Secretária
  'commercial',  -- Comercial
  'owner',       -- Dono
  'partner',     -- Sócio
  'manager',     -- Gerente
  'other'        -- Outro
);

-- §4 Status operacional da próxima ação (organiza o trabalho diário).
create type next_action_status as enum (
  'awaiting_reply',   -- Aguardando resposta
  'do_follow_up',     -- Fazer Follow-up
  'send_proposal',    -- Enviar proposta
  'call',             -- Ligar
  'schedule_meeting', -- Agendar reunião
  'closed'            -- Encerrado
);

alter table companies
  add column approach_channel   approach_channel not null default 'whatsapp',
  add column contact_role       contact_role,
  add column next_action_status next_action_status;

-- Índices para as métricas futuras por canal / próxima ação (Relatórios).
create index idx_companies_approach_channel on companies(approach_channel);
create index idx_companies_next_action_status on companies(next_action_status)
  where next_action_status is not null;

-- A trilha de eventos de campo reutiliza a tabela audit_events já existente
-- (entity_type='company', action='approach_channel_changed' | 'contact_role_changed'
-- | 'next_action_changed', metadata com valores antigo/novo). Sem tabela nova.
