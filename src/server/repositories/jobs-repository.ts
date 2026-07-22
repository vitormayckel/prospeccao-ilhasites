import type { Db } from "@/lib/database/sql";
import type { JobRow, JobPhase, JobCandidateRow } from "@/types/domain";
import type { NormalizedCandidate } from "@/server/repositories/collection-repository";

/** Tempo de posse do job por um worker. Expirado, outro tick pode retomar. */
export const LOCK_SECONDS = 120;

export interface CreateJobInput {
  jobType: string;
  searchProfileId: string;
  idempotencyKey: string;
  targetQualified: number;
  maxProviderCalls: number;
  maxAiCalls: number;
  deadlineAt: string | null;
  payload: Record<string, unknown>;
}

/** 23505 — violação de unicidade, em qualquer um dos dois drivers. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === "23505") return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("duplicate key value") ||
    message.includes("violates unique constraint")
  );
}

export function createJobsRepository(db: Db) {
  // Funções locais (não métodos): os repositories também são consumidos por
  // desestruturação, e um `this` implícito quebraria nesses casos.
  async function create(input: CreateJobInput): Promise<JobRow> {
    const rows = await db.query<JobRow>(
      `insert into job_queue
           (job_type, search_profile_id, idempotency_key, status, phase,
            target_qualified, max_provider_calls, max_ai_calls, deadline_at, payload)
         values ($1,$2,$3,'queued','SEARCH',$4,$5,$6,$7,$8)
         on conflict (idempotency_key) do nothing
         returning *`,
      [
        input.jobType,
        input.searchProfileId,
        input.idempotencyKey,
        input.targetQualified,
        input.maxProviderCalls,
        input.maxAiCalls,
        input.deadlineAt,
        input.payload,
      ],
    );
    if (rows[0]) return rows[0];
    // Conflito de idempotência: outra requisição já criou este job.
    const existing = await db.query<JobRow>(
      "select * from job_queue where idempotency_key = $1",
      [input.idempotencyKey],
    );
    return existing[0]!;
  }

  /**
   * Job ainda em andamento para um perfil. É a defesa contra execução
   * duplicada que a chave de idempotência (por minuto) não cobre: clicar
   * "Iniciar" de novo dez minutos depois criaria uma segunda execução
   * concorrente sobre o mesmo perfil, gastando Google e IA em dobro.
   */
  async function findActiveByProfile(
    profileId: string,
  ): Promise<JobRow | null> {
    const rows = await db.query<JobRow>(
      `select * from job_queue
        where job_type = 'prospect_pipeline'
          and search_profile_id = $1
          and status in ('queued','running')
        order by created_at desc limit 1`,
      [profileId],
    );
    return rows[0] ?? null;
  }

  return {
    create,
    findActiveByProfile,

    /**
     * Cria o job garantindo UMA execução ativa por perfil.
     *
     * `uq_job_queue_active_profile` (migration 0012) é quem realmente impede a
     * corrida: a checagem prévia em `findActiveByProfile` é TOCTOU e duas
     * requisições simultâneas passam as duas. Aqui a segunda recebe 23505 do
     * banco e é convertida na execução que já existe — o chamador nunca vê
     * erro técnico, e nenhuma execução duplicada é criada.
     */
    async createUnique(
      input: CreateJobInput,
    ): Promise<{ job: JobRow; alreadyRunning: boolean }> {
      const active = await findActiveByProfile(input.searchProfileId);
      if (active) return { job: active, alreadyRunning: true };

      try {
        return { job: await create(input), alreadyRunning: false };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Corrida perdida entre a checagem acima e o INSERT: o índice único
        // barrou a segunda execução. Devolve a que venceu.
        const winner = await findActiveByProfile(input.searchProfileId);
        // Sem job ativo após um 23505 significa que a violação veio de outra
        // restrição — repassa, senão o erro real ficaria escondido.
        if (!winner) throw error;
        return { job: winner, alreadyRunning: true };
      }
    },

    /**
     * Reivindica atomicamente o próximo job elegível.
     *
     * `for update skip locked` garante que dois workers concorrentes (Cron e
     * encadeamento rodando juntos, por exemplo) nunca peguem o mesmo job.
     * Também retoma jobs cujo lock expirou — é o que recupera uma execução
     * morta pelo timeout da Vercel ou por reinício da função.
     */
    async claimNext(
      workerId: string,
      jobType = "prospect_pipeline",
    ): Promise<JobRow | null> {
      const rows = await db.query<JobRow>(
        // O filtro por job_type é essencial: a fila é compartilhada e sem ele
        // o runner reivindicaria jobs de outros tipos, que não sabe executar.
        `update job_queue j set
           status = 'running',
           locked_by = $1,
           locked_at = now(),
           lock_expires_at = now() + ($2 || ' seconds')::interval,
           started_at = coalesce(j.started_at, now()),
           -- attempts conta FALHAS, não ticks. Um job saudável precisa de
           -- muitos ticks e não pode consumir max_attempts só por progredir.
           -- Só incrementa ao roubar um lock expirado (status ainda 'running'),
           -- que é a assinatura de um tick morto sem liberar o job.
           attempts = j.attempts
             + case when j.status = 'running' then 1 else 0 end,
           updated_at = now()
         where j.id = (
           select id from job_queue
            where job_type = $3
              and ((status = 'queued' and run_after <= now())
                or (status = 'running' and lock_expires_at < now()))
            order by created_at
            for update skip locked
            limit 1
         )
         returning j.*`,
        [workerId, String(LOCK_SECONDS), jobType],
      );
      return rows[0] ?? null;
    },

    /** Renova o lock durante um tick longo (heartbeat). */
    async renewLock(jobId: string, workerId: string): Promise<boolean> {
      const rows = await db.query<{ id: string }>(
        `update job_queue set
           lock_expires_at = now() + ($3 || ' seconds')::interval, updated_at = now()
         where id = $1 and locked_by = $2
         returning id`,
        [jobId, workerId, String(LOCK_SECONDS)],
      );
      return rows.length > 0;
    },

    /** Solta o lock deixando o job pronto para o próximo tick. */
    async release(
      jobId: string,
      input: { phase: JobPhase; runAfterSeconds?: number },
    ): Promise<void> {
      await db.query(
        `update job_queue set
           status = 'queued',
           phase = $2,
           locked_by = null,
           lock_expires_at = null,
           run_after = now() + ($3 || ' seconds')::interval,
           updated_at = now()
         where id = $1`,
        [jobId, input.phase, String(input.runAfterSeconds ?? 0)],
      );
    },

    async setPhase(jobId: string, phase: JobPhase): Promise<void> {
      await db.query(
        "update job_queue set phase = $2, updated_at = now() where id = $1",
        [jobId, phase],
      );
    },

    async setCursor(
      jobId: string,
      input: {
        combo: number;
        page: number;
        /**
         * Token da próxima página. `null` limpa a paginação; OMITIR mantém o
         * token e o carimbo intactos.
         *
         * A distinção importa: a gravação de posição feita no início do passo
         * (só para o painel mostrar onde a busca está) não pode re-carimbar o
         * `cursor_page_token_at`, senão a carência do token seria recontada do
         * zero a cada tick e a página seguinte esperaria sempre o tempo cheio.
         */
        pageToken?: string | null;
        city: string | null;
        state: string | null;
        term: string | null;
      },
    ): Promise<void> {
      const touchToken = "pageToken" in input;
      const token = input.pageToken ?? null;
      await db.query(
        `update job_queue set
           cursor_combo = $2, cursor_page = $3,
           cursor_page_token = case when $4 then $5::text else cursor_page_token end,
           cursor_page_token_at = case
             when not $4 then cursor_page_token_at
             when $5::text is null then null
             -- Carimba só quando um token NOVO entra: é daqui que sai a
             -- carência antes de pedir a próxima página.
             else now()
           end,
           current_city = $6, current_state = $7, current_term = $8,
           updated_at = now()
         where id = $1`,
        [
          jobId,
          input.combo,
          input.page,
          touchToken,
          token,
          input.city,
          input.state,
          input.term,
        ],
      );
    },

    async linkSearchRun(jobId: string, searchRunId: string): Promise<void> {
      await db.query(
        "update job_queue set search_run_id = $2, updated_at = now() where id = $1",
        [jobId, searchRunId],
      );
    },

    /**
     * Incrementa contadores de forma relativa. Relativo (e não absoluto) para
     * que dois ticks concorrentes nunca sobrescrevam o progresso um do outro.
     */
    async bumpCounters(
      jobId: string,
      deltas: Partial<Record<JobCounter, number>>,
    ): Promise<void> {
      const entries = Object.entries(deltas).filter(([, v]) => v);
      if (entries.length === 0) return;
      const sets = entries
        .map(([col], i) => `${col} = ${col} + $${i + 2}`)
        .join(", ");
      await db.query(
        `update job_queue set ${sets}, updated_at = now() where id = $1`,
        [jobId, ...entries.map(([, v]) => v as number)],
      );
    },

    /**
     * Reserva orçamento de IA ANTES de gastar. Debita, na mesma instrução
     * atômica, no máximo o que ainda resta (`max_ai_calls - used_ai_calls`) e
     * devolve quantas chamadas foram concedidas — nunca mais que o teto, mesmo
     * com ticks concorrentes, porque o cálculo acontece dentro do UPDATE.
     *
     * Quem reserva é obrigado a devolver o que não usar (`refundAiCalls`).
     */
    async reserveAiCalls(jobId: string, want: number): Promise<number> {
      if (want <= 0) return 0;
      // O CTE lê o saldo ANTES do débito (RETURNING enxergaria o valor já
      // atualizado) e o `for update` serializa reservas concorrentes.
      const rows = await db.query<{ granted: number }>(
        `with saldo as (
           select id, least($2::int, greatest(max_ai_calls - used_ai_calls, 0)) as granted
             from job_queue
            where id = $1
            for update
         )
         update job_queue j
            set used_ai_calls = j.used_ai_calls + saldo.granted, updated_at = now()
           from saldo
          where j.id = saldo.id
          returning saldo.granted as granted`,
        [jobId, want],
      );
      return rows[0]?.granted ?? 0;
    },

    /** Devolve reserva não consumida (lote menor que o concedido, falha antes da chamada). */
    async refundAiCalls(jobId: string, amount: number): Promise<void> {
      if (amount <= 0) return;
      await db.query(
        `update job_queue
            set used_ai_calls = greatest(used_ai_calls - $2::int, 0), updated_at = now()
          where id = $1`,
        [jobId, amount],
      );
    },

    async finish(
      jobId: string,
      input: {
        status: "completed" | "failed" | "cancelled";
        phase: JobPhase;
        reason: string;
        errorSummary?: string | null;
        errorDetail?: string | null;
      },
    ): Promise<void> {
      await db.query(
        `update job_queue set
           status = $2, phase = $3, finish_reason = $4,
           last_error = $5, error_detail = $6,
           locked_by = null, lock_expires_at = null,
           finished_at = now(), updated_at = now()
         where id = $1`,
        [
          jobId,
          input.status,
          input.phase,
          input.reason,
          input.errorSummary ?? null,
          input.errorDetail ?? null,
        ],
      );
    },

    /** Agenda nova tentativa com backoff limitado por max_attempts. */
    async scheduleRetry(
      jobId: string,
      input: {
        delaySeconds: number;
        errorSummary: string;
        errorDetail: string;
      },
    ): Promise<{ exhausted: boolean }> {
      const rows = await db.query<{ exhausted: boolean }>(
        // Os literais do CASE precisam de cast explícito: sem ele a expressão
        // resolve para `text` e o Postgres recusa a atribuição à coluna enum.
        // Nas expressões SET, `attempts` é o valor ANTIGO; no RETURNING, o
        // NOVO. Por isso o SET compara attempts+1 e o RETURNING compara
        // attempts direto — ambos avaliam o total já incrementado.
        `update job_queue set
           attempts = attempts + 1,
           status = case when attempts + 1 >= max_attempts
                         then 'failed'::job_status
                         else 'queued'::job_status end,
           run_after = now() + ($2 || ' seconds')::interval,
           last_error = $3,
           error_detail = $4,
           finish_reason = case when attempts + 1 >= max_attempts
                                then 'max_attempts_reached' else finish_reason end,
           finished_at = case when attempts + 1 >= max_attempts then now() else finished_at end,
           locked_by = null, lock_expires_at = null, updated_at = now()
         where id = $1
         returning (attempts >= max_attempts) as exhausted`,
        [
          jobId,
          String(Math.max(1, Math.floor(input.delaySeconds))),
          input.errorSummary,
          input.errorDetail,
        ],
      );
      return { exhausted: rows[0]?.exhausted ?? false };
    },

    async getById(jobId: string): Promise<JobRow | null> {
      const rows = await db.query<JobRow>(
        "select * from job_queue where id = $1",
        [jobId],
      );
      return rows[0] ?? null;
    },

    /** Execuções recentes para o painel de progresso. */
    async listRecent(limit = 5): Promise<JobRow[]> {
      return db.query<JobRow>(
        `select * from job_queue
         where job_type = 'prospect_pipeline'
         order by created_at desc
         limit ${Number(limit)}`,
      );
    },

    async countActive(): Promise<number> {
      const rows = await db.query<{ c: number }>(
        `select count(*)::int as c from job_queue
         where job_type = 'prospect_pipeline' and status in ('queued','running')`,
      );
      return rows[0]?.c ?? 0;
    },

    /**
     * Recovery (Cron diário): solta locks expirados de jobs que ficaram
     * presos em `running`. Não altera contadores nem apaga nada — apenas
     * devolve o job à fila para o pipeline retomar de onde parou.
     */
    async recoverAbandoned(graceMinutes: number): Promise<number> {
      // O sinal de abandono é o LOCK expirado, não `updated_at`: o trigger
      // set_updated_at reescreve updated_at em toda escrita, então ele não
      // distingue um job vivo de um morto. `graceMinutes` além da expiração
      // evita competir com um tick que está apenas renovando o lock.
      const rows = await db.query<{ id: string }>(
        `update job_queue set
           status = 'queued', locked_by = null, lock_expires_at = null,
           run_after = now(), updated_at = now()
         where status = 'running'
           and lock_expires_at is not null
           and lock_expires_at < now() - ($1 || ' minutes')::interval
         returning id`,
        [String(Math.max(1, Math.floor(graceMinutes)))],
      );
      return rows.length;
    },

    // ---- job_candidates (estágio entre SEARCH e ANALYZE) ------------------

    /**
     * Grava candidatos brutos de uma página. `on conflict do nothing` sobre
     * (job_id, provider, external_id) torna a página idempotente: refazer a
     * mesma página após uma falha não duplica candidato nem gera nova análise.
     * Devolve quantos foram realmente inseridos.
     */
    async stageCandidates(
      jobId: string,
      provider: string,
      items: {
        externalId: string | null;
        rawPayload: Record<string, unknown>;
        city: string | null;
        state: string | null;
        term: string | null;
      }[],
    ): Promise<number> {
      let inserted = 0;
      for (const item of items) {
        const rows = await db.query<{ id: string }>(
          `insert into job_candidates
             (job_id, provider, external_id, raw_payload, stage, city, state, term)
           values ($1,$2,$3,$4,'pending_normalize',$5,$6,$7)
           on conflict (job_id, provider, external_id)
             where external_id is not null do nothing
           returning id`,
          [
            jobId,
            provider,
            item.externalId,
            item.rawPayload,
            item.city,
            item.state,
            item.term,
          ],
        );
        if (rows[0]) inserted++;
      }
      return inserted;
    },

    async listCandidatesByStage(
      jobId: string,
      stage: string,
      limit: number,
    ): Promise<JobCandidateRow[]> {
      return db.query<JobCandidateRow>(
        `select * from job_candidates
         where job_id = $1 and stage = $2
         order by created_at
         limit ${Number(limit)}`,
        [jobId, stage],
      );
    },

    async countCandidatesByStage(
      jobId: string,
      stage: string,
    ): Promise<number> {
      const rows = await db.query<{ c: number }>(
        "select count(*)::int as c from job_candidates where job_id = $1 and stage = $2",
        [jobId, stage],
      );
      return rows[0]?.c ?? 0;
    },

    async setCandidateNormalized(
      candidateId: string,
      normalized: NormalizedCandidate,
    ): Promise<void> {
      await db.query(
        `update job_candidates set
           normalized = $2, stage = 'pending_dedup', updated_at = now()
         where id = $1`,
        [candidateId, normalized as unknown as Record<string, unknown>],
      );
    },

    async resolveCandidate(
      candidateId: string,
      input: {
        stage: string;
        companyId?: string | null;
        reason?: string | null;
      },
    ): Promise<void> {
      await db.query(
        `update job_candidates set
           stage = $2, company_id = $3, reason = $4, updated_at = now()
         where id = $1`,
        [
          candidateId,
          input.stage,
          input.companyId ?? null,
          input.reason ?? null,
        ],
      );
    },

    /** Empresas novas deste job que ainda aguardam análise de IA. */
    async listCompaniesPendingAnalysis(
      jobId: string,
      limit: number,
    ): Promise<{ company_id: string }[]> {
      return db.query<{ company_id: string }>(
        `select jc.company_id from job_candidates jc
         join companies c on c.id = jc.company_id
         where jc.job_id = $1 and jc.stage = 'new'
           and c.deleted_at is null
           and c.review_status = 'pending_analysis'
         order by jc.created_at
         limit ${Number(limit)}`,
        [jobId],
      );
    },

    /**
     * Apuração de qualificadas para este job.
     *
     * "Qualificada" = empresa NOVA cuja análise concluiu (o critério de score
     * já adotado no projeto: a análise leva a empresa a pending_review).
     * `minScore` é um piso opcional: com 0 nada é desclassificado por nota,
     * preservando o comportamento atual.
     */
    async countQualification(
      jobId: string,
      minScore: number,
    ): Promise<{ qualified: number; disqualified: number; pending: number }> {
      const rows = await db.query<{
        qualified: number;
        disqualified: number;
        pending: number;
      }>(
        `select
           count(*) filter (
             where c.review_status in ('pending_review','approved')
               and coalesce(c.score, 0) >= $2
           )::int as qualified,
           count(*) filter (
             where c.review_status = 'analysis_failed'
                or (c.review_status in ('pending_review','approved')
                    and coalesce(c.score, 0) < $2)
                or c.review_status = 'rejected'
           )::int as disqualified,
           count(*) filter (where c.review_status = 'pending_analysis')::int as pending
         from job_candidates jc
         join companies c on c.id = jc.company_id
         where jc.job_id = $1 and jc.stage = 'new' and c.deleted_at is null`,
        [jobId, minScore],
      );
      return rows[0] ?? { qualified: 0, disqualified: 0, pending: 0 };
    },

    /**
     * Grava os contadores de qualificação a partir da apuração ao vivo.
     *
     * Absoluto (SET, não incremento): são derivados de `countQualification`,
     * que já conta o total. Sem esta gravação as colunas ficavam em zero e o
     * painel exibia "0 qualificadas" num job que atingiu a meta — métrica
     * errada mostrada ao operador.
     */
    async setQualificationCounters(
      jobId: string,
      input: { qualified: number; disqualified: number },
    ): Promise<void> {
      await db.query(
        `update job_queue set
           count_qualified = $2, count_disqualified = $3, updated_at = now()
         where id = $1`,
        [jobId, input.qualified, input.disqualified],
      );
    },

    /** Motivos agregados de exclusão — alimenta o resumo transparente (§8). */
    async summarizeReasons(
      jobId: string,
    ): Promise<{ stage: string; reason: string | null; c: number }[]> {
      return db.query<{ stage: string; reason: string | null; c: number }>(
        `select stage, reason, count(*)::int as c
         from job_candidates where job_id = $1
         group by stage, reason order by c desc`,
        [jobId],
      );
    },
  };
}

export type JobCounter =
  | "results_raw"
  | "count_new"
  | "count_existing"
  | "count_duplicate"
  | "count_invalid"
  | "count_suppressed"
  | "count_analyzed"
  | "count_qualified"
  | "count_disqualified"
  | "count_failed"
  | "count_replacements"
  | "used_provider_calls"
  | "used_ai_calls";

export type JobsRepository = ReturnType<typeof createJobsRepository>;
