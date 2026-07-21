import "server-only";
import type { JobsRepository } from "@/server/repositories/jobs-repository";
import type { CollectionRepository } from "@/server/repositories/collection-repository";
import type { NormalizedCandidate } from "@/server/repositories/collection-repository";
import type { SearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
import type { AnalysisService } from "@/server/services/analysis-service";
import type { JobPhase, JobRow, CompanyRow } from "@/types/domain";
import type { ProviderResult, ProviderSearchQuery } from "@/server/providers/places";
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
import { logInfo, logAndSanitize, isTransientError, redact } from "@/lib/errors";

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

/** Resultados pedidos por chamada ao provedor. */
const PER_QUERY_CAP = 20;

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
  jobs: JobsRepository;
  collection: CollectionRepository;
  searchProfiles: SearchProfilesRepository;
  analysis: AnalysisService;
}) {
  const { jobs, collection, searchProfiles, analysis } = deps;

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

        const next = await runStep(current, workerId);
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

  /** Falha do tick: transitória vira retry com backoff; o resto encerra. */
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

    // Backoff exponencial com teto — nunca retry infinito: `attempts` já foi
    // incrementado no claim e `max_attempts` encerra o job.
    const delay = Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1));
    const { exhausted } = await jobs.scheduleRetry(job.id, {
      delaySeconds: delay,
      errorSummary: logged.message,
      errorDetail: `[${logged.correlationId}] ${detail}`,
    });

    logInfo("job.tick.failure", {
      jobId: job.id,
      phase: job.phase,
      transient: isTransientError(error),
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

  /** Um passo da máquina de estados. Devolve a próxima fase. */
  async function runStep(job: JobRow, workerId: string): Promise<JobPhase> {
    // Heartbeat: o lock não pode expirar enquanto o tick trabalha.
    await jobs.renewLock(job.id, workerId);

    switch (job.phase) {
      case "SEARCH":
      case "SEARCH_REPLACEMENTS":
        return stepSearch(job);
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

  async function stepSearch(job: JobRow): Promise<JobPhase> {
    // Sem orçamento de busca: segue processando o que já foi coletado.
    if (!canSearch(job)) return "NORMALIZE";

    const combos = await loadCombos(job);
    if (job.cursor_combo >= combos.length) {
      // Não há mais combinações para pesquisar — apura o resultado.
      return "NORMALIZE";
    }

    const combo = combos[job.cursor_combo]!;
    await jobs.setCursor(job.id, {
      combo: job.cursor_combo,
      page: job.cursor_page,
      city: combo.city,
      state: combo.state,
      term: combo.term,
    });

    // O run de coleta é criado uma vez e reaproveitado (proveniência).
    const runId = await ensureSearchRun(job);

    const provider = resolveProviderForRun(
      (job.payload.provider as string) || "google_places",
    );

    const query: ProviderSearchQuery = {
      category: combo.term,
      providerCategory: combo.providerCategory,
      city: combo.city,
      // UF explícita: a consulta ao provedor precisa ser inequívoca.
      state: combo.state,
      countryCode: combo.countryCode,
      limit: PER_QUERY_CAP,
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

    // Uma combinação por passo: o provedor devolve a página cheia de uma vez.
    await jobs.setCursor(job.id, {
      combo: job.cursor_combo + 1,
      page: 0,
      city: combo.city,
      state: combo.state,
      term: combo.term,
    });

    logInfo("job.search.page", {
      jobId: job.id,
      city: combo.city,
      state: combo.state,
      term: combo.term,
      raw: outcome.results.length,
      staged: inserted,
      runId,
    });

    return "NORMALIZE";
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
      const candidate = row.normalized as unknown as NormalizedCandidate;

      if (
        await collection.isSuppressed({
          phoneE164: candidate.phoneE164,
          normalizedDomain: candidate.normalizedDomain,
        })
      ) {
        await jobs.resolveCandidate(row.id, {
          stage: "suppressed",
          reason: "lista_de_supressao",
        });
        await jobs.bumpCounters(job.id, { count_suppressed: 1 });
        continue;
      }

      // Ordem de confiança da deduplicação:
      //   1. Place ID   — identidade forte do provedor
      //   2. Telefone   — identidade forte do negócio
      //   3. Domínio PRÓPRIO — nunca rede social (candidate.normalizedDomain
      //      já vem null para instagram/facebook/linktree/wa.me etc.)
      //   4. Nome + cidade — tratado adiante como INCERTO, nunca fusão
      let exact: CompanyRow | null = null;
      let reason: string | null = null;
      if (candidate.externalId) {
        exact = await collection.findByProviderExternalId(
          candidate.provider,
          candidate.externalId,
        );
        if (exact) reason = "mesmo_place_id";
      }
      if (!exact && candidate.phoneE164) {
        exact = await collection.findByPhone(candidate.phoneE164);
        if (exact) reason = "mesmo_telefone";
      }
      if (!exact && candidate.normalizedDomain && !isSocialDomain(candidate.normalizedDomain)) {
        const byDomain = await collection.findByDomain(candidate.normalizedDomain);
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
        // Preserva proveniência sem reanalisar nem sobrescrever dados.
        const source = await collection.upsertSource(exact.id, candidate);
        await collection.fillMissingCompanyFields(exact.id, candidate);
        await collection.insertFieldEvidence(
          exact.id,
          source.id,
          evidenceOf(candidate),
        );
        await jobs.resolveCandidate(row.id, {
          stage: "existing",
          companyId: exact.id,
          reason,
        });
        await jobs.bumpCounters(job.id, { count_existing: 1 });
        continue;
      }

      // Nível 4: nome semelhante na mesma cidade → entra, mas sinalizado.
      const similar = await collection.findSimilarByName(
        candidate.normalizedName,
        candidate.city,
      );

      const company = await collection.insertCompany(candidate, runId);
      const source = await collection.upsertSource(company.id, candidate);
      await collection.insertFieldEvidence(
        company.id,
        source.id,
        evidenceOf(candidate),
      );
      if (similar) {
        await collection.addUncertainDuplicateNote(company.id, {
          id: similar.company.id,
          name: similar.company.name,
          similarity: similar.similarity,
        });
      }
      await jobs.resolveCandidate(row.id, {
        stage: "new",
        companyId: company.id,
      });
      await jobs.bumpCounters(job.id, { count_new: 1 });
    }
    return "DEDUP";
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
    if (job.search_run_id) {
      await collection.finishRun(job.search_run_id, {
        status:
          counts.qualified >= job.target_qualified ? "completed" : "partial",
        resultsSeen: job.results_raw,
        newCompanies: job.count_new,
        duplicates: job.count_duplicate + job.count_existing,
        failedItems: job.count_failed,
        estimatedCost: 0,
      });
    }

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

export type JobRunner = ReturnType<typeof createJobRunner>;
