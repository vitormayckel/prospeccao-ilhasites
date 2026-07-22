"use server";

import { revalidatePath } from "next/cache";
import { createServerContext } from "@/server/context";
import { scheduleNextTick } from "@/server/services/tick-scheduler";
import { toActionError } from "@/lib/errors";
import type { JobRow } from "@/types/domain";

export interface StartProspectResult {
  ok: boolean;
  jobId?: string;
  /** true quando devolvemos um job já em andamento em vez de criar outro. */
  alreadyRunning?: boolean;
  error?: string;
}

/** Tetos de segurança padrão (§4) — evitam custo descontrolado. */
const DEFAULT_MAX_PROVIDER_CALLS = 60;
const DEFAULT_MAX_AI_CALLS = 200;
const DEFAULT_MAX_DURATION_MINUTES = 60;
const MAX_TARGET_QUALIFIED = 100;

/**
 * Cria uma execução de prospecção como job persistente e dispara o primeiro
 * tick. Busca e análise passam a ser um fluxo único: não é mais necessário
 * clicar em "Analisar pendentes".
 *
 * O progresso é persistido a cada passo, então atualizar a página não perde
 * nada. Fechar a aba, porém, ainda interrompe o AVANÇO: medido em produção em
 * 22/07, o encadeamento de ticks morre quando a invocação é congelada e o job
 * fica parado até alguém reabrir a tela. Enquanto não houver um Cron por
 * minuto chamando /api/jobs/tick, a aba precisa continuar aberta.
 */
export async function startProspectJobAction(
  profileId: string,
  targetQualified: number,
): Promise<StartProspectResult> {
  try {
    const { repositories } = await createServerContext();

    const profile = await repositories.searchProfiles.getDetail(profileId);
    if (!profile) {
      return { ok: false, error: "Perfil de pesquisa não encontrado." };
    }
    if (profile.locations.length === 0) {
      return { ok: false, error: "Adicione ao menos uma cidade ao perfil." };
    }
    if (profile.categories.filter((c) => c.active).length === 0) {
      return { ok: false, error: "Adicione ao menos uma categoria ativa." };
    }
    // Toda localidade precisa de UF em sigla — sem isso a busca no Google sai
    // com o estado errado e a dedup por cidade+nome não confere (FASE 3).
    const semUf = profile.locations.filter(
      (l) => !l.state || !/^[A-Z]{2}$/.test(l.state.trim().toUpperCase()),
    );
    if (semUf.length > 0) {
      return {
        ok: false,
        error: `Corrija o estado da cidade "${semUf[0]!.city}" antes de iniciar.`,
      };
    }

    // Meta explícita quando válida; senão o limite diário do perfil. O teto
    // existe porque a meta governa quantas chamadas pagas o job pode fazer.
    // Validado ANTES da checagem de execução em andamento: um pedido inválido
    // é inválido de qualquer forma, e responder "ok" a ele esconderia o erro.
    const target =
      Number.isFinite(targetQualified) && targetQualified > 0
        ? Math.floor(targetQualified)
        : profile.profile.daily_limit;
    if (target > MAX_TARGET_QUALIFIED) {
      return {
        ok: false,
        error: `A meta máxima por execução é de ${MAX_TARGET_QUALIFIED} empresas qualificadas.`,
      };
    }

    const deadline = new Date(
      Date.now() + DEFAULT_MAX_DURATION_MINUTES * 60_000,
    ).toISOString();

    // Nunca duas execuções sobre o mesmo perfil: gastaria Google e IA em dobro
    // pelos mesmos resultados. `createUnique` checa antes E deixa o índice
    // único do banco arbitrar a corrida — devolve a execução em andamento em
    // vez de criar outra, e a interface leva o usuário ao progresso dela.
    //
    // Chave de idempotência por minuto: dois cliques seguidos reaproveitam o
    // mesmo job mesmo quando o anterior já terminou.
    const minute = new Date().toISOString().slice(0, 16);
    const { job, alreadyRunning } = await repositories.jobs.createUnique({
      jobType: "prospect_pipeline",
      searchProfileId: profileId,
      idempotencyKey: `prospect:${profileId}:${minute}`,
      targetQualified: target,
      maxProviderCalls: DEFAULT_MAX_PROVIDER_CALLS,
      maxAiCalls: DEFAULT_MAX_AI_CALLS,
      deadlineAt: deadline,
      payload: { provider: profile.profile.provider },
    });

    if (alreadyRunning) {
      return { ok: true, jobId: job.id, alreadyRunning: true };
    }

    scheduleNextTick("start");
    revalidatePath("/");
    revalidatePath("/settings/searches");
    return { ok: true, jobId: job.id };
  } catch (error) {
    return {
      ok: false,
      error: toActionError(
        "action.startProspectJob",
        error,
        "Erro ao iniciar a execução.",
      ),
    };
  }
}

/**
 * Id da execução em andamento para o perfil, ou null.
 *
 * Existe para o botão "Iniciar prospecção" já nascer desabilitado quando outra
 * aba (ou o agendador) iniciou a execução. Nunca lança: na dúvida devolve
 * null, e as demais camadas de proteção seguem valendo.
 */
export async function getActiveJobForProfileAction(
  profileId: string,
): Promise<string | null> {
  try {
    const { repositories } = await createServerContext();
    const active = await repositories.jobs.findActiveByProfile(profileId);
    return active?.id ?? null;
  } catch {
    return null;
  }
}

export interface JobProgress {
  job: JobRow | null;
  reasons: { stage: string; reason: string | null; c: number }[];
}

/** Leitura do progresso para o painel — nunca lança. */
export async function getJobProgressAction(
  jobId: string,
): Promise<JobProgress> {
  try {
    const { repositories } = await createServerContext();
    const [job, reasons] = await Promise.all([
      repositories.jobs.getById(jobId),
      repositories.jobs.summarizeReasons(jobId),
    ]);
    return { job, reasons };
  } catch {
    return { job: null, reasons: [] };
  }
}

/**
 * Aciona um tick a partir da interface. É a rede de segurança do
 * encadeamento: se um tick se perdeu, abrir o painel retoma o trabalho.
 */
export async function nudgeJobsAction(): Promise<{ ok: boolean }> {
  try {
    const { repositories } = await createServerContext();
    const active = await repositories.jobs.countActive();
    if (active > 0) scheduleNextTick("ui-nudge");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
