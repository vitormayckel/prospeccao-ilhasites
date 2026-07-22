-- =====================================================================
-- Ilha Prospect — Migration 0012: reativação em DEDUP, execução única por
-- perfil e paginação do provedor.
--
-- Contexto (falha real de 2026-07-22): a limpeza de dados de teste arquivou
-- empresas (soft delete), mas `company_sources` não tem `deleted_at` e o índice
-- único `uq_company_sources_provider_ext` (provider, external_id) não conhece
-- soft delete. As consultas de dedup filtram `deleted_at is null`, então o
-- pipeline deixou de enxergar as empresas arquivadas, concluiu "é nova",
-- inseriu a empresa e violou a unicidade ao gravar a fonte — deixando uma
-- empresa órfã e abortando o tick, três vezes, até esgotar `max_attempts`.
--
-- A correção da causa raiz é de LÓGICA (lookup que enxerga arquivadas +
-- reativação + transação por candidato), não de schema. Esta migration NÃO
-- enfraquece nenhuma restrição: `uq_company_sources_provider_ext` permanece
-- exatamente como está, protegendo a identidade forte do Place ID.
--
-- Aditiva e reversível:
--   - só adiciona colunas nullable e índices;
--   - não remove, não altera e não apaga nenhum dado existente;
--   - nenhuma constraint é relaxada.
--
-- Rollback: ver bloco comentado ao final.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 Execução única por perfil — garantia estrutural (requisito 8)
-- ---------------------------------------------------------------------
-- A checagem em `findActiveByProfile` continua sendo a primeira linha de
-- defesa (dá mensagem boa ao operador), mas ela é TOCTOU: duas requisições
-- simultâneas passam as duas. A chave de idempotência por minuto também não
-- cobre dois cliques em minutos diferentes.
--
-- Este índice fecha a corrida no banco: no máximo UMA execução em
-- 'queued'/'running' por perfil. A segunda inserção recebe 23505 e o
-- repositório a converte em "já existe execução em andamento".
--
-- Verificado antes de criar: não há hoje nenhum job ativo duplicado por
-- perfil (todos os prospect_pipeline estão em estado terminal).
create unique index if not exists uq_job_queue_active_profile
  on job_queue(search_profile_id)
  where job_type = 'prospect_pipeline'
    and search_profile_id is not null
    and status in ('queued', 'running');

-- ---------------------------------------------------------------------
-- §2 Paginação do provedor de coleta (requisito 9)
-- ---------------------------------------------------------------------
-- `cursor_page` (integer) só conta páginas; o Google Places (New) pagina por
-- token opaco. Sem persistir o token, uma combinação cidade×categoria nunca
-- passava de 20 resultados — o teto de uma página.
--
-- `cursor_page_token_at` existe porque o token do Google leva alguns instantes
-- para ficar válido após a resposta que o gerou. Guardar o instante permite
-- esperar só o que falta, em vez de dormir um valor fixo a cada página.
alter table job_queue
  add column if not exists cursor_page_token    text,
  add column if not exists cursor_page_token_at timestamptz;

-- ---------------------------------------------------------------------
-- §3 Suporte ao lookup de reativação
-- ---------------------------------------------------------------------
-- A consulta nova (`findByProviderExternalIdIncludingDeleted`) filtra por
-- (provider, external_id) sem restringir a empresa. O índice único já
-- existente atende exatamente esse predicado, então NENHUM índice novo é
-- necessário aqui — registrado explicitamente para que a ausência seja uma
-- decisão documentada e não um esquecimento:
--
--   uq_company_sources_provider_ext
--     on company_sources(provider, external_id) where external_id is not null
--
-- Mantido intacto de propósito (requisito 4): dois registros distintos, ativos
-- ou históricos, continuam impedidos de representar o mesmo Place ID.

comment on index uq_company_sources_provider_ext is
  'Identidade forte do Place ID. NAO conhece soft delete de companies por '
  'desenho: arquivar uma empresa nao libera o Place ID dela. O pipeline deve '
  'reativar a empresa arquivada (ver findByProviderExternalIdIncludingDeleted), '
  'nunca inserir uma nova.';

-- =====================================================================
-- ROLLBACK (nenhum dado de domínio é perdido):
--
--   drop index if exists uq_job_queue_active_profile;
--   alter table job_queue
--     drop column if exists cursor_page_token,
--     drop column if exists cursor_page_token_at;
--   comment on index uq_company_sources_provider_ext is null;
-- =====================================================================
