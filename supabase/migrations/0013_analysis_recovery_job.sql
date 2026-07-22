-- =====================================================================
-- 0013 — Recuperação de análises como JOB da fila
--
-- Antes, reprocessar empresas em `analysis_failed` era um lote síncrono de 3
-- por clique, limitado pelo teto da função serverless. Com 22 empresas o
-- operador precisava clicar 8 vezes.
--
-- A fila persistente já resolve exatamente isso para a prospecção: um clique
-- cria o job e o encadeamento de ticks o leva até o fim. Esta migration só
-- habilita o mesmo padrão para a recuperação — nenhuma coluna nova é
-- necessária, porque `job_queue` já tem tudo (phase, contadores, lock,
-- deadline, orçamento de IA).
--
-- Aditiva. Não altera dados nem estruturas existentes.
-- =====================================================================

-- Uma recuperação ativa por vez. Diferente da prospecção, o escopo não é o
-- perfil e sim a base inteira: dois jobs simultâneos disputariam as mesmas
-- empresas e gastariam chamadas pagas em duplicidade.
--
-- Sem `search_profile_id` no predicado: o índice de prospecção
-- (uq_job_queue_active_profile) é por perfil; este é global para o tipo.
create unique index if not exists uq_job_queue_active_analysis_recovery
  on job_queue((job_type))
  where job_type = 'analysis_recovery'
    and status in ('queued', 'running');

comment on index uq_job_queue_active_analysis_recovery is
  'Garante no máximo uma recuperação de análises ativa. Impede duplo clique e '
  'consumo duplicado de chamadas pagas de IA sobre as mesmas empresas.';

-- ---------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------
--   drop index if exists uq_job_queue_active_analysis_recovery;
--
-- Nada mais a desfazer: a migration não cria colunas, tabelas nem tipos, e
-- não escreve nenhuma linha. Jobs de tipo 'analysis_recovery' porventura
-- existentes continuam válidos como linhas comuns de job_queue.
