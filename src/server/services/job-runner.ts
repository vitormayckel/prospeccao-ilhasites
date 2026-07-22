import "server-only";
import type { Db } from "@/lib/database/sql";
import { createJobsRepository } from "@/server/repositories/jobs-repository";
import type { JobsRepository } from "@/server/repositories/jobs-repository";
import { createCollectionRepository } from "@/server/repositories/collection-repository";
import type { CollectionRepository } from "@/server/repositories/collection-repository";
import type { NormalizedCandidate } from "@/server/repositories/collection-repository";
import { createAuditRepository } from "@/server/repositories/audit-repository";
import type { SearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
import type { AnalysisService } from "@/server/services/analysis-service";
import type {
  JobPhase,
  JobRow,
  CompanyRow,
  JobCandidateRow,
} from "@/types/domain";
import type {
  PlacesProvider,
  ProviderResult,
  ProviderSearchQuery,
} from "@/server/providers/places";
import { resolveProviderForRun } from "@/server/providers/places";
import {
  normalizeName,
  normalizeCity,
  normalizePhoneE164,
  normalizeOwnDomain,
  normalizeUf,
  normalizeUrl,
  normalizeAddress,
  isSocialDomain,
} from "@/server/services/normalization";
import {
  logInfo,
  logAndSanitize,
  isTransientError,
  isPermanentError,
  toWriteFailureMessage,
  redact,
} from "@/lib/errors";

// =====================================================================
// Runner do pipeline de prospecção.
//
// Um TICK executa uma fatia pequena, persiste tudo e encerra. A fase corrente
// vive em job_queue.phase, então qualquer interrupção — timeout da Vercel,
// reinício da função, aba fechada — é retomada exatamente do último estado.
//
// Quem agenda o próximo tick é externo e intercambiável (encadeamento por
// waitUntil no Hobby, Cron no Pro). O runner é idêntico nos dois casos.
// =====================================================================

/**
 * Orçamento por tick. O padrão de 8s fica abaixo do menor teto de função
 * (Hobby, 10s) com folga para fechar o tick.
 *
 * Configurável por ambiente porque é o único número que muda ao migrar para
 * o Pro: lá a função pode durar mais, então um orçamento maior faz o mesmo
 * trabalho em menos ticks. A arquitetura não muda — só este valor.
 * Limitado a 60s para nunca exceder o `maxDuration` da rota.
 */
export const DEFAULT_TICK_BUDGET_MS = Math.min(
  60_000,
  Math.max(3_000, Number(process.env.JOBS_TICK_BUDGET_MS || 8_000)),
);

/** Reserva para fechar o tick (persistir e soltar o lock) sem ser cortado. */
const CLOSING_RESERVE_MS = 1_500;

/** Candidatos processados por passo de NORMALIZE/DEDUP. */
const NORMALIZE_BATCH = 20;
const DEDUP_BATCH = 10;

/** Análises simultâneas. Conservador: cada análise faz várias queries. */
const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY || 2);

/** Piso de score. 0 = desativado (nenhuma desclassificação por nota). */
const MIN_SCORE = Number(process.env.PIPELINE_MIN_SCORE || 0);

/** Resultados pedidos por chamada ao provedor (tamanho de UMA página). */
const PER_QUERY_CAP = 20;

/**
 * Páginas por combinação cidade×categoria.
 *
 * O Text Search do Google entrega no máximo 3 páginas (60 resultados) por
 * consulta — pedir mais é gastar chamada à toa. Antes o pipeline parava na
 * página 1: o `nextPageToken` existia no tipo de resposta e nunca era usado,
 * então cada combinação rendia no máximo 20 resultados.
 */
const MAX_PAGES_PER_COMBO = Math.max(
  1,
  Number(process.env.PIPELINE_MAX_PAGES_PER_COMBO || 3),
);

/**
 * Carência antes de usar um `pageToken`. O token não fica válido no mesmo
 * instante em que é emitido; pedir cedo demais devolve erro. Esperamos apenas
 * o que falta desde a emissão, nunca um valor fixo por página.
 */
const PAGE_TOKEN_MIN_DELAY_MS = 2_000;

export interface TickResult {
  picked: boolean;
  jobId?: string;
  phase?: JobPhase;
  /** true quando ainda há trabalho — o agendador deve disparar outro tick. */
  hasMoreWork: boolean;
  steps: number;
}

interface Combo {
  city: string;
  state: string;
  countryCode: string;
  term: string;
  providerCategory: string | null;
}

export function createJobRunner(deps: {
  /**
   * Conexão de banco. Necessária para abrir transações: a etapa DEDUP grava
   * empresa + fonte + evidência + estado do candidato como uma unidade.
   */
  db: Db;
  jobs: JobsRepository;
  collection: CollectionRepository;
  searchProfiles: SearchProfilesRepository;
  analysis: AnalysisService;
  /** Injetável para teste; em produção resolve pelo nome do perfil. */
  resolveProvider?: (providerName: string) => PlacesProvider;
}) {
  const { db, jobs, collection, searchProfiles, analysis } = deps;
  const resolveProvider = deps.resolveProvider ?? resolveProviderForRun;

  /**
   * Executa um tick: reivindica um job e avança o que couber no orçamento.
   * Nunca lança — falhas viram retry agendado ou job marcado como failed,
   * para que um job com problema jamais derrube quem o chamou.
   */
  async function runTick(options?: {
    budgetMs?: number;
    workerId?: string;
  }): Promise<TickResult> {
    const budgetMs = options?.budgetMs ?? DEFAULT_TICK_BUDGET_MS;
    const workerId =
      options?.workerId ?? `w_${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = Date.now();
    const remaining = () => budgetMs - (Date.now() - startedAt);

    const job = await jobs.claimNext(workerId);
    if (!job) return { picked: false, hasMoreWork: false, steps: 0 };

    logInfo("job.tick.claim", {
      jobId: job.id,
      phase: job.phase,
      attempt: job.attempts,
      workerId,
    });

    let current: JobRow = job;
    let steps = 0;

    try {
      while (remaining() > CLOSING_RESERVE_MS) {
        // Só a duração máxima encerra o job no meio. Os tetos de custo
        // (Google/IA) apenas impedem NOVAS chamadas: encerrar aqui
        // descartaria candidatos já pagos e ainda não processados.
        const stop = deadlineReached(current);
        if (stop) {
          await finishJob(current, stop);
          return {
            picked: true,
            jobId: current.id,
            phase: "FINISHED",
            hasMoreWork: false,
            steps,
          };
        }

        const next = await runStep(current, workerId, remaining);
        steps++;

        if (next === "FINISHED") {
          return {
            picked: true,
            jobId: current.id,
            phase: "FINISHED",
            hasMoreWork: false,
            steps,
          };
        }

        // Recarrega o estado persistido: contadores e cursor mudaram.
        const reloaded = await jobs.getById(current.id);
        if (!reloaded) break;
        current = reloaded;
        if (current.phase !== next) await jobs.setPhase(current.id, next);
        current = { ...current, phase: next };
      }

      // Orçamento esgotado com trabalho pendente: solta o lock e sinaliza
      // ao agendador que outro tick é necessário.
      await jobs.release(current.id, { phase: current.phase });
      logInfo("job.tick.yield", {
        jobId: current.id,
        phase: current.phase,
        steps,
        durationMs: Date.now() - startedAt,
      });
      return {
        picked: true,
        jobId: current.id,
        phase: current.phase,
        hasMoreWork: true,
        steps,
      };
    } catch (error) {
      return handleTickFailure(current, error, steps);
    }
  }

  /**
   * Falha do tick.
   *
   * A decisão de retentar é do `isTransientError`: SÓ erro transitório vira
   * nova tentativa. Antes o retry era incondicional, e uma violação de
   * unicidade (permanente por definição) era repetida até esgotar
   * `max_attempts` — três tentativas idênticas, um minuto perdido e um motivo
   * de encerramento genérico ("max_attempts_reached") que não dizia nada ao
   * operador.
   *
   * Erro permanente encerra o job na hora, com motivo e mensagem próprios.
   */
  async function handleTickFailure(
    job: JobRow,
    error: unknown,
    steps: number,
  ): Promise<TickResult> {
    const logged = logAndSanitize("job.tick", error, {
      jobId: job.id,
      phase: job.phase,
    });
    const detail = error instanceof Error ? redact(error.message) : "";
    const transient = isTransientError(error);

    if (!transient) {
      // Mensagem de ESCRITA, não de leitura: a falha aconteceu ao gravar.
      const userMessage = `${toWriteFailureMessage(error)} (ref: ${logged.correlationId})`;
      await failJob(job, {
        reason: "erro_permanente",
        userMessage,
        detail: `[${logged.correlationId}] ${detail}`,
      });

      logInfo("job.tick.failure", {
        jobId: job.id,
        phase: job.phase,
        transient: false,
        permanent: isPermanentError(error),
        retried: false,
        correlationId: logged.correlationId,
      });

      return {
        picked: true,
        jobId: job.id,
        phase: "FINISHED",
        hasMoreWork: false,
        steps,
      };
    }

    // Backoff exponencial com teto — nunca retry infinito: `attempts` já foi
    // incrementado no claim e `max_attempts` encerra o job.
    const delay = Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1));
    const { exhausted } = await jobs.scheduleRetry(job.id, {
      delaySeconds: delay,
      errorSummary: logged.message,
      errorDetail: `[${logged.correlationId}] ${detail}`,
    });

    // Tentativas esgotadas encerram o job de fato: o run de coleta precisa
    // sair de 'running', senão fica preso para sempre (§8 — transparência).
    if (exhausted) {
      await finalizeSearchRun(job, {
        status: "failed",
        errorCode: "max_attempts_reached",
        errorMessage: logged.message,
      });
    }

    logInfo("job.tick.failure", {
      jobId: job.id,
      phase: job.phase,
      transient: true,
      exhausted,
      retryInSeconds: exhausted ? 0 : delay,
      correlationId: logged.correlationId,
    });

    return {
      picked: true,
      jobId: job.id,
      phase: job.phase,
      hasMoreWork: !exhausted,
      steps,
    };
  }

  /** Encerra o job por erro que não se resolve sozinho. */
  async function failJob(
    job: JobRow,
    input: { reason: string; userMessage: string; detail: string },
  ): Promise<void> {
    await jobs.finish(job.id, {
      status: "failed",
      phase: job.phase,
      reason: input.reason,
      errorSummary: input.userMessage,
      errorDetail: input.detail,
    });
    await finalizeSearchRun(job, {
      status: "failed",
      errorCode: input.reason,
      errorMessage: input.userMessage,
    });
    await sweepPendingAnalysis(job);
  }

  /**
   * Nenhuma empresa pode continuar "Aguardando análise" depois que o job
   * terminou — não há mais quem a analise. Roda em TODO encerramento, feliz
   * ou não.
   */
  async function sweepPendingAnalysis(job: JobRow): Promise<void> {
    const swept = await jobs.sweepPendingAnalysis(job.id);
    if (swept > 0) {
      logInfo("job.sweepPendingAnalysis", { jobId: job.id, swept });
    }
  }

  /**
   * Fecha o `search_run` do job com os números já apurados.
   *
   * Antes só o caminho feliz chamava `finishRun`; um job que falhava deixava o
   * run em 'running' com `finished_at` nulo permanentemente. Dois runs desta
   * execução ficaram exatamente assim.
   */
  async function finalizeSearchRun(
    job: JobRow,
    input: {
      status: "failed" | "partial" | "completed";
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    // Recarrega SEMPRE, e é daqui que sai o `search_run_id`.
    //
    // O `job` em memória é o estado do início do passo: quando o run foi
    // criado dentro do passo que falhou (`ensureSearchRun`), o vínculo já está
    // no banco mas ainda é null na cópia local. Ler o campo local fazia esta
    // função retornar cedo e deixar o run preso em 'running' — exatamente o
    // sintoma que ela existe para evitar.
    const fresh = (await jobs.getById(job.id)) ?? job;
    const runId = fresh.search_run_id ?? job.search_run_id;
    if (!runId) return;
    await collection.finishRun(runId, {
      status: input.status,
      resultsSeen: fresh.results_raw,
      newCompanies: fresh.count_new,
      duplicates: fresh.count_duplicate + fresh.count_existing,
      failedItems: fresh.count_failed,
      estimatedCost: 0,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });
  }

  /** Um passo da máquina de estados. Devolve a próxima fase. */
  async function runStep(
    job: JobRow,
    workerId: string,
    remainingMs: () => number,
  ): Promise<JobPhase> {
    // Heartbeat: o lock não pode expirar enquanto o tick trabalha.
    await jobs.renewLock(job.id, workerId);

    switch (job.phase) {
      case "SEARCH":
      case "SEARCH_REPLACEMENTS":
        return stepSearch(job, remainingMs);
      case "NORMALIZE":
        return stepNormalize(job);
      case "DEDUP":
        return stepDedup(job);
      case "ANALYZE":
        return stepAnalyze(job);
      case "QUALIFY":
        return stepQualify(job);
      case "FINISHED":
        return "FINISHED";
    }
  }

  // ---- SEARCH ---------------------------------------------------------

  async function stepSearch(
    job: JobRow,
    remainingMs: () => number,
  ): Promise<JobPhase> {
    // Sem orçamento de busca: segue processando o que já foi coletado.
    if (!canSearch(job)) return "NORMALIZE";

    const combos = await loadCombos(job);
    if (job.cursor_combo >= combos.length) {
      // Não há mais combinações para pesquisar — apura o resultado.
      return "NORMALIZE";
    }

    // A carência do `pageToken` não cabe no que resta do tick.
    //
    // Dormir mesmo assim estouraria o orçamento (o laço admite um passo com
    // 1,5 s restantes, e a espera vai a 2 s) e, no plano Hobby, poderia levar
    // a função ao teto de 10 s e ser morta no meio. O token continua salvo no
    // cursor: o próximo tick retoma esta mesma página sem perder nada.
    const espera = pageTokenWaitMs(job);
    if (espera > 0 && espera >= remainingMs() - CLOSING_RESERVE_MS) {
      logInfo("job.search.deferPage", {
        jobId: job.id,
        waitMs: espera,
        remainingMs: remainingMs(),
      });
      return "NORMALIZE";
    }

    const combo = combos[job.cursor_combo]!;
    // Só posição, para o painel. `pageToken` omitido de propósito: preserva o
    // token e o instante de emissão (ver `setCursor`).
    await jobs.setCursor(job.id, {
      combo: job.cursor_combo,
      page: job.cursor_page,
      city: combo.city,
      state: combo.state,
      term: combo.term,
    });

    // O run de coleta é criado uma vez e reaproveitado (proveniência).
    const runId = await ensureSearchRun(job);

    const provider = resolveProvider(
      (job.payload.provider as string) || "google_places",
    );

    // Continuação da mesma combinação: respeita a carência do token. A espera
    // já foi medida acima e cabe no orçamento restante.
    if (espera > 0) await sleep(espera);

    const query: ProviderSearchQuery = {
      category: combo.term,
      providerCategory: combo.providerCategory,
      city: combo.city,
      // UF explícita: a consulta ao provedor precisa ser inequívoca.
      state: combo.state,
      countryCode: combo.countryCode,
      limit: PER_QUERY_CAP,
      pageToken: job.cursor_page_token,
    };

    const outcome = await provider.search(query);
    const inserted = await jobs.stageCandidates(
      job.id,
      provider.name,
      outcome.results.map((result: ProviderResult) => ({
        externalId: result.externalId,
        rawPayload: result as unknown as Record<string, unknown>,
        city: combo.city,
        state: combo.state,
        term: combo.term,
      })),
    );

    await jobs.bumpCounters(job.id, {
      results_raw: outcome.results.length,
      used_provider_calls: 1,
      // Já vistos neste job (mesmo place ID) são duplicatas da execução.
      count_duplicate: outcome.results.length - inserted,
    });

    // -----------------------------------------------------------------
    // Paginação: continuar na MESMA combinação ou avançar para a próxima.
    //
    // Continuar exige, simultaneamente:
    //   - o provedor ter oferecido a próxima página;
    //   - não ter estourado o teto de páginas por combinação;
    //   - ainda haver orçamento de chamadas ao provedor (contando a que
    //     acabou de sair);
    //   - ainda haver orçamento de IA: sem ele o candidato coletado nunca
    //     seria analisado, então a página extra é dinheiro gasto no Google por
    //     resultado que morre em pending_analysis;
    //   - a meta de QUALIFICADAS ainda não ter sido atingida — paginar além da
    //     meta é gastar chamada paga por resultado que ninguém vai usar.
    // -----------------------------------------------------------------
    const nextPage = job.cursor_page + 1;
    const budgetLeft = job.used_provider_calls + 1 < job.max_provider_calls;
    const continuaMesmoCombo =
      Boolean(outcome.nextPageToken) &&
      nextPage < MAX_PAGES_PER_COMBO &&
      budgetLeft &&
      canAnalyze(job) &&
      job.count_qualified < job.target_qualified;

    await jobs.setCursor(
      job.id,
      continuaMesmoCombo
        ? {
            combo: job.cursor_combo,
            page: nextPage,
            pageToken: outcome.nextPageToken ?? null,
            city: combo.city,
            state: combo.state,
            term: combo.term,
          }
        : {
            combo: job.cursor_combo + 1,
            page: 0,
            // Token sempre limpo ao trocar de combinação: um token pertence à
            // consulta que o gerou e não vale para outra cidade/categoria.
            pageToken: null,
            city: combo.city,
            state: combo.state,
            term: combo.term,
          },
    );

    logInfo("job.search.page", {
      jobId: job.id,
      city: combo.city,
      state: combo.state,
      term: combo.term,
      page: job.cursor_page,
      raw: outcome.results.length,
      staged: inserted,
      hasNextPage: Boolean(outcome.nextPageToken),
      continua: continuaMesmoCombo,
      runId,
    });

    return "NORMALIZE";
  }

  /**
   * Quanto ainda falta da carência do `pageToken`, em ms. 0 quando não há
   * token ou quando ele já está pronto. Nunca passa de
   * PAGE_TOKEN_MIN_DELAY_MS, mesmo com relógio adiantado.
   */
  function pageTokenWaitMs(job: JobRow): number {
    if (!job.cursor_page_token || !job.cursor_page_token_at) return 0;
    const elapsed = Date.now() - new Date(job.cursor_page_token_at).getTime();
    const wait = PAGE_TOKEN_MIN_DELAY_MS - elapsed;
    if (wait <= 0) return 0;
    return Math.min(wait, PAGE_TOKEN_MIN_DELAY_MS);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- NORMALIZE ------------------------------------------------------

  async function stepNormalize(job: JobRow): Promise<JobPhase> {
    const batch = await jobs.listCandidatesByStage(
      job.id,
      "pending_normalize",
      NORMALIZE_BATCH,
    );
    if (batch.length === 0) return "DEDUP";

    for (const row of batch) {
      const result = row.raw_payload as unknown as ProviderResult;
      if (!result?.name) {
        await jobs.resolveCandidate(row.id, {
          stage: "invalid",
          reason: "sem_nome",
        });
        await jobs.bumpCounters(job.id, { count_invalid: 1 });
        continue;
      }
      await jobs.setCandidateNormalized(
        row.id,
        candidateFrom(row.provider, result),
      );
    }
    return "NORMALIZE";
  }

  // ---- DEDUP (sempre ANTES de qualquer custo de IA) --------------------

  async function stepDedup(job: JobRow): Promise<JobPhase> {
    const batch = await jobs.listCandidatesByStage(
      job.id,
      "pending_dedup",
      DEDUP_BATCH,
    );
    if (batch.length === 0) return "ANALYZE";

    const runId = await ensureSearchRun(job);

    for (const row of batch) {
      try {
        await processCandidate(job, row, runId);
      } catch (error) {
        // Erro TRANSITÓRIO derruba o tick de propósito: o candidato continua
        // em 'pending_dedup' e a próxima tentativa o reprocessa do zero (a
        // transação garante que nada parcial ficou).
        if (isTransientError(error)) throw error;

        // Erro PERMANENTE é do candidato, não do job: repetir o lote inteiro
        // não muda nada e mataria a execução por causa de uma linha. O
        // candidato é posto em quarentena com o motivo real e o pipeline
        // segue. Nada foi gravado — a transação já reverteu.
        const logged = logAndSanitize("job.dedup.candidate", error, {
          jobId: job.id,
          candidateId: row.id,
          externalId: row.external_id,
        });
        await jobs.resolveCandidate(row.id, {
          stage: "invalid",
          reason: "conflito_de_identidade",
        });
        await jobs.bumpCounters(job.id, { count_failed: 1 });
        logInfo("job.dedup.quarantine", {
          jobId: job.id,
          candidateId: row.id,
          externalId: row.external_id,
          correlationId: logged.correlationId,
        });
      }
    }
    return "DEDUP";
  }

  /**
   * Processa UM candidato de forma atômica.
   *
   * Tudo o que decide e grava o destino do candidato — encontrar a empresa,
   * reativar arquivada, criar nova, gravar fonte, evidência, nota de duplicata
   * incerta, contadores e o próprio estágio do candidato — acontece dentro de
   * uma única transação.
   *
   * Sem isso, a falha real de 2026-07-22 gravava a empresa e explodia ao
   * gravar a fonte, deixando uma empresa órfã (sem fonte, sem evidência, fora
   * dos contadores) a cada tentativa. Agora, ou tudo entra, ou nada entra.
   */
  async function processCandidate(
    job: JobRow,
    row: JobCandidateRow,
    runId: string,
  ): Promise<void> {
    const candidate = row.normalized as unknown as NormalizedCandidate;

    await db.transaction(async (tx) => {
      const col = createCollectionRepository(tx);
      const jb = createJobsRepository(tx);
      const audit = createAuditRepository(tx);

      if (
        await col.isSuppressed({
          phoneE164: candidate.phoneE164,
          normalizedDomain: candidate.normalizedDomain,
        })
      ) {
        await jb.resolveCandidate(row.id, {
          stage: "suppressed",
          reason: "lista_de_supressao",
        });
        await jb.bumpCounters(job.id, { count_suppressed: 1 });
        return;
      }

      // Ordem de confiança da deduplicação:
      //   1. Place ID   — identidade forte do provedor, INCLUSIVE arquivadas
      //   2. Telefone   — identidade forte do negócio
      //   3. Domínio PRÓPRIO — nunca rede social (candidate.normalizedDomain
      //      já vem null para instagram/facebook/linktree/wa.me etc.)
      //   4. Nome + cidade — tratado adiante como INCERTO, nunca fusão
      let exact: CompanyRow | null = null;
      let reason: string | null = null;

      // Nível 1. Este é o único nível que enxerga empresas arquivadas, e é
      // deliberado: o Place ID é a identidade que o índice único protege.
      // Ignorar a arquivada aqui foi exatamente a causa da falha.
      if (candidate.externalId) {
        const hit = await col.findByProviderExternalIdIncludingDeleted(
          candidate.provider,
          candidate.externalId,
        );
        if (hit) {
          if (hit.company.deleted_at) {
            // Reativação: mesmo id, histórico/análises/auditoria preservados.
            const restored = await col.restoreCompany(hit.company.id);
            await col.refreshCompanyFromCandidate(hit.company.id, candidate);
            await audit.log({
              entityType: "company",
              entityId: hit.company.id,
              action: "company.reactivated",
              metadata: {
                jobId: job.id,
                searchRunId: runId,
                provider: candidate.provider,
                externalId: candidate.externalId,
                archivedAt: hit.company.deleted_at,
                previousName: hit.company.name,
                collectedName: candidate.name,
              },
            });
            exact = restored ?? hit.company;
            reason = "empresa_reativada";
          } else {
            exact = hit.company;
            reason = "mesmo_place_id";
          }
        }
      }

      if (!exact && candidate.phoneE164) {
        exact = await col.findByPhone(candidate.phoneE164);
        if (exact) reason = "mesmo_telefone";
      }
      if (
        !exact &&
        candidate.normalizedDomain &&
        !isSocialDomain(candidate.normalizedDomain)
      ) {
        const byDomain = await col.findByDomain(candidate.normalizedDomain);
        // Telefone divergente VETA o match por domínio: filiais de uma mesma
        // rede compartilham o site corporativo, mas são negócios distintos —
        // endereço, telefone e decisor próprios. Observado com "Rede Odonto"
        // (Vitória/Vila Velha/Cariacica) colapsando em um único registro.
        const telefonesConflitam =
          Boolean(byDomain?.phone_e164) &&
          Boolean(candidate.phoneE164) &&
          byDomain!.phone_e164 !== candidate.phoneE164;
        if (byDomain && !telefonesConflitam) {
          exact = byDomain;
          reason = "mesmo_dominio_proprio";
        }
      }

      if (exact) {
        const { source, conflict } = await col.upsertSourceChecked(
          exact.id,
          candidate,
        );
        // O Place ID pertence a OUTRA empresa (dedup casou por telefone ou
        // domínio com um registro diferente). Não re-vinculamos em silêncio:
        // isso reescreveria a proveniência alheia. Registra e segue.
        if (conflict) {
          await jb.resolveCandidate(row.id, {
            stage: "duplicate",
            companyId: source.company_id,
            reason: "place_id_de_outra_empresa",
          });
          await jb.bumpCounters(job.id, { count_duplicate: 1 });
          return;
        }

        // Reativada recebe os dados novos; já ativa só preenche lacunas
        // (nunca sobrescreve o que o operador já viu).
        if (reason !== "empresa_reativada") {
          await col.fillMissingCompanyFields(exact.id, candidate);
        }
        await col.insertFieldEvidence(
          exact.id,
          source.id,
          evidenceOf(candidate),
        );
        await jb.resolveCandidate(row.id, {
          stage: "existing",
          companyId: exact.id,
          reason,
        });
        await jb.bumpCounters(job.id, { count_existing: 1 });
        return;
      }

      // Nível 4: nome semelhante na mesma cidade → entra, mas sinalizado.
      const similar = await col.findSimilarByName(
        candidate.normalizedName,
        candidate.city,
      );

      const company = await col.insertCompany(candidate, runId);
      const { source, conflict } = await col.upsertSourceChecked(
        company.id,
        candidate,
      );
      // Rede de segurança: o nível 1 já teria encontrado este Place ID. Se
      // ainda assim houver conflito, abortamos a transação — a empresa recém
      // inserida é revertida e o candidato vai para quarentena. Nunca uma
      // órfã.
      if (conflict) {
        throw new IdentityConflictError(
          candidate.provider,
          candidate.externalId,
        );
      }

      await col.insertFieldEvidence(
        company.id,
        source.id,
        evidenceOf(candidate),
      );
      if (similar) {
        await col.addUncertainDuplicateNote(company.id, {
          id: similar.company.id,
          name: similar.company.name,
          similarity: similar.similarity,
        });
      }
      await jb.resolveCandidate(row.id, {
        stage: "new",
        companyId: company.id,
      });
      await jb.bumpCounters(job.id, { count_new: 1 });
    });
  }

  // ---- ANALYZE --------------------------------------------------------

  async function stepAnalyze(job: JobRow): Promise<JobPhase> {
    // Reserva o orçamento ANTES de chamar a IA. O débito é atômico e limitado
    // ao saldo, então o lote nunca excede o teto — antes o lote tinha tamanho
    // fixo e o estouro chegava a ANALYSIS_CONCURRENCY - 1 chamadas pagas
    // além da meta.
    const granted = await jobs.reserveAiCalls(job.id, ANALYSIS_CONCURRENCY);
    if (granted === 0) return "QUALIFY";

    const pending = await jobs.listCompaniesPendingAnalysis(job.id, granted);
    if (pending.length === 0) {
      await jobs.refundAiCalls(job.id, granted);
      return "QUALIFY";
    }

    // Sobra quando há menos empresas pendentes que orçamento concedido.
    await jobs.refundAiCalls(job.id, granted - pending.length);

    // Concorrência limitada e explícita: no máximo ANALYSIS_CONCURRENCY
    // análises simultâneas. allSettled garante que uma falha não derrube as
    // demais nem o tick.
    const results = await Promise.allSettled(
      pending.map((p) => analysis.analyzeCompany(p.company_id)),
    );

    let analyzed = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) analyzed++;
      else failed++;
    }

    // used_ai_calls já foi debitado na reserva: aqui só os contadores de
    // resultado. Uma chamada que falhou continua consumida — foi paga.
    await jobs.bumpCounters(job.id, {
      count_analyzed: analyzed,
      count_failed: failed,
    });

    // Mantém o painel coerente durante a análise, não só ao final.
    const live = await jobs.countQualification(job.id, MIN_SCORE);
    await jobs.setQualificationCounters(job.id, {
      qualified: live.qualified,
      disqualified: live.disqualified,
    });

    logInfo("job.analyze.batch", {
      jobId: job.id,
      requested: pending.length,
      analyzed,
      failed,
    });

    return "ANALYZE";
  }

  // ---- QUALIFY --------------------------------------------------------

  async function stepQualify(job: JobRow): Promise<JobPhase> {
    const counts = await jobs.countQualification(job.id, MIN_SCORE);

    // Persiste a apuração: é o que o painel de progresso exibe.
    await jobs.setQualificationCounters(job.id, {
      qualified: counts.qualified,
      disqualified: counts.disqualified,
    });

    // Ainda há empresas aguardando análise E orçamento de IA: volta.
    // Sem o teste de orçamento, QUALIFY e ANALYZE ficariam em laço infinito.
    if (counts.pending > 0 && canAnalyze(job)) return "ANALYZE";

    logInfo("job.qualify", {
      jobId: job.id,
      qualified: counts.qualified,
      disqualified: counts.disqualified,
      target: job.target_qualified,
    });

    if (counts.qualified >= job.target_qualified) {
      await finishJob(job, "meta_atingida");
      return "FINISHED";
    }

    // Meta não atingida: buscar substitutas se ainda houver de onde.
    const combos = await loadCombos(job);
    const hasMoreCombos = job.cursor_combo < combos.length;

    // Só busca substitutas se houver combinação E orçamento dos dois lados.
    if (!hasMoreCombos || !canSearch(job) || !canAnalyze(job)) {
      await finishJob(job, exhaustionReason(job, hasMoreCombos));
      return "FINISHED";
    }

    await jobs.bumpCounters(job.id, { count_replacements: 1 });
    return "SEARCH_REPLACEMENTS";
  }

  // ---- limites e encerramento ----------------------------------------

  /** Duração máxima — o único teto que encerra o job no meio do caminho. */
  function deadlineReached(job: JobRow): string | null {
    if (job.deadline_at && new Date(job.deadline_at).getTime() < Date.now()) {
      return "duracao_maxima_atingida";
    }
    return null;
  }

  /** Ainda pode chamar o provedor de busca? */
  function canSearch(job: JobRow): boolean {
    return job.used_provider_calls < job.max_provider_calls;
  }

  /** Ainda pode gastar análise de IA? */
  function canAnalyze(job: JobRow): boolean {
    return job.used_ai_calls < job.max_ai_calls;
  }

  /** Motivo do encerramento quando a meta não foi atingida. */
  function exhaustionReason(job: JobRow, hasMoreCombos: boolean): string {
    if (!canAnalyze(job)) return "limite_chamadas_ia";
    if (!canSearch(job)) return "limite_chamadas_provedor";
    if (!hasMoreCombos) return "combinacoes_esgotadas";
    return "limites_atingidos";
  }

  async function finishJob(job: JobRow, reason: string): Promise<void> {
    const counts = await jobs.countQualification(job.id, MIN_SCORE);
    // Números finais persistidos antes do encerramento.
    await jobs.setQualificationCounters(job.id, {
      qualified: counts.qualified,
      disqualified: counts.disqualified,
    });
    await jobs.finish(job.id, {
      status: "completed",
      phase: "FINISHED",
      reason:
        counts.qualified >= job.target_qualified ? "meta_atingida" : reason,
    });

    // Fecha o run de coleta com os números finais (transparência §8).
    await finalizeSearchRun(job, {
      status:
        counts.qualified >= job.target_qualified ? "completed" : "partial",
    });
    await sweepPendingAnalysis(job);

    logInfo("job.finished", {
      jobId: job.id,
      reason,
      qualified: counts.qualified,
      target: job.target_qualified,
      raw: job.results_raw,
      new: job.count_new,
      existing: job.count_existing,
      duplicates: job.count_duplicate,
    });
  }

  // ---- apoio ----------------------------------------------------------

  /** Combinações cidade×termo, na ordem estável do perfil. */
  async function loadCombos(job: JobRow): Promise<Combo[]> {
    if (!job.search_profile_id) return [];
    const detail = await searchProfiles.getDetail(job.search_profile_id);
    if (!detail) return [];
    const combos: Combo[] = [];
    for (const location of detail.locations) {
      for (const category of detail.categories.filter((c) => c.active)) {
        combos.push({
          city: location.city,
          state: location.state,
          countryCode: location.country_code,
          term: category.label,
          providerCategory: category.provider_category,
        });
      }
    }
    return combos;
  }

  /** Cria o search_run na primeira necessidade e memoriza no job. */
  async function ensureSearchRun(job: JobRow): Promise<string> {
    if (job.search_run_id) return job.search_run_id;
    const fresh = await jobs.getById(job.id);
    if (fresh?.search_run_id) return fresh.search_run_id;

    const run = await collection.createRun({
      profileId: job.search_profile_id,
      idempotencyKey: `job:${job.id}`,
      trigger: "manual",
    });
    await jobs.linkSearchRun(job.id, run.id);
    return run.id;
  }

  return { runTick };
}

function candidateFrom(
  provider: string,
  result: ProviderResult,
): NormalizedCandidate {
  return {
    provider,
    externalId: result.externalId,
    name: result.name,
    normalizedName: normalizeName(result.name),
    primaryCategory: result.primaryCategory,
    phoneRaw: result.phone,
    phoneE164: normalizePhoneE164(result.phone),
    websiteUrl: normalizeUrl(result.website),
    // Domínio PRÓPRIO: rede social vira null e nunca serve de identidade.
    normalizedDomain: normalizeOwnDomain(result.website),
    instagramUrl: normalizeUrl(result.instagram),
    addressLine: result.addressLine,
    normalizedAddress: normalizeAddress(result.addressLine),
    city: result.city,
    normalizedCity: normalizeCity(result.city),
    state: normalizeUf(result.state),
    postalCode: result.postalCode,
    countryCode: result.countryCode,
    latitude: result.latitude,
    longitude: result.longitude,
    rating: result.rating,
    reviewsCount: result.reviewsCount,
    sourceUrl: result.sourceUrl,
    rawPayload: result.rawPayload,
  };
}

function evidenceOf(
  candidate: NormalizedCandidate,
): { field: string; value: string | null }[] {
  return [
    { field: "name", value: candidate.name },
    { field: "phone", value: candidate.phoneE164 },
    { field: "website", value: candidate.websiteUrl },
    { field: "instagram", value: candidate.instagramUrl },
    { field: "address", value: candidate.addressLine },
  ];
}

/**
 * Colisão de identidade forte: o (provider, external_id) do candidato já
 * pertence a outra empresa.
 *
 * Carrega `code = "23505"` de propósito — é a mesma classe de problema que o
 * banco reportaria, e assim `isPermanentError` a reconhece sem precisar de um
 * caso especial. Permanente por definição: retentar dá o mesmo resultado.
 */
export class IdentityConflictError extends Error {
  readonly code = "23505";

  constructor(provider: string, externalId: string | null) {
    super(
      `Identificador ${provider}:${externalId ?? "(nulo)"} já pertence a outra empresa.`,
    );
    this.name = "IdentityConflictError";
  }
}

export type JobRunner = ReturnType<typeof createJobRunner>;
