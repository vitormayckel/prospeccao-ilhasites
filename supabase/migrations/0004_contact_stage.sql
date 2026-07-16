-- =====================================================================
-- Ilha Prospect — Migration 0004: máquina de estados do primeiro contato
-- Regra central: a 1ª mensagem é SÓ uma saudação curta. Só depois que o
-- lead responde é que a mensagem comercial é preparada. O sistema nunca
-- envia — apenas organiza estado, lembretes e o deep link manual.
-- Aditiva e reversível (novo enum + coluna com default; novo valor de enum).
-- =====================================================================

-- Estados explícitos do fluxo de contato (Blueprint §17 adaptado).
create type contact_stage as enum (
  'not_started',          -- saudação pendente
  'greeting_prepared',    -- saudação preparada (WhatsApp aberto, não confirmado)
  'awaiting_reply',       -- saudação enviada, aguardando resposta
  'replied',              -- lead respondeu (confirmação manual do operador)
  'commercial_prepared',  -- mensagem comercial preparada
  'commercial_sent',      -- mensagem comercial enviada
  'follow_up_scheduled',  -- follow-up agendado
  'closed'                -- contato encerrado
);

alter table companies
  add column contact_stage contact_stage not null default 'not_started';

create index idx_companies_contact_stage on companies(contact_stage);

-- Novo tipo de mensagem: saudação inicial (ping curto, sem conteúdo comercial).
-- A mensagem comercial após a resposta continua sendo 'first_contact'.
alter type message_kind add value if not exists 'greeting';
