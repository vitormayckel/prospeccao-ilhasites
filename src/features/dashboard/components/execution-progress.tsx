"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { getJobProgressAction, nudgeJobsAction } from "@/server/actions/jobs";
import type { JobRow, JobPhase } from "@/types/domain";

// =====================================================================
// Progresso da execução em tempo quase real.
//
// Lê o estado PERSISTIDO do job — o componente é uma janela para o banco.
//
// Ressalva medida em produção (22/07): o `nudgeJobsAction` deste polling NÃO
// é apenas rede de segurança. Sem ele o encadeamento de ticks morre quando a
// invocação é congelada, e o job fica parado (dois travamentos, de 3min54s e
// 8min29s, ambos encerrados no instante em que a aba foi reaberta). Enquanto
// não houver um Cron por minuto chamando /api/jobs/tick, manter esta aba
// aberta é o que conclui a execução.
//
// Polling moderado (5s) e apenas enquanto o job está ativo — encerrado, o
// polling para e o banco deixa de ser consultado.
// =====================================================================

const POLL_INTERVAL_MS = 5_000;

const PHASES: { id: JobPhase; label: string }[] = [
  { id: "SEARCH", label: "Busca" },
  { id: "NORMALIZE", label: "Normalização" },
  { id: "DEDUP", label: "Deduplicação" },
  { id: "ANALYZE", label: "Análise" },
  { id: "QUALIFY", label: "Qualificação" },
  { id: "FINISHED", label: "Concluída" },
];

const STATUS_TONE: Record<string, StatusTone> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "na fila",
  running: "em execução",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
};

/** Motivos técnicos traduzidos para linguagem do operador. */
const FINISH_REASON: Record<string, string> = {
  meta_atingida: "Meta de oportunidades qualificadas atingida.",
  combinacoes_esgotadas:
    "Todas as combinações de cidade e categoria do perfil foram pesquisadas.",
  limite_chamadas_provedor:
    "Limite de chamadas ao Google Places atingido (proteção de custo).",
  limite_chamadas_ia: "Limite de análises de IA atingido (proteção de custo).",
  duracao_maxima_atingida: "Duração máxima da execução atingida.",
  max_attempts_reached:
    "A execução falhou repetidamente e foi encerrada após o limite de tentativas.",
  erro_permanente:
    "A execução parou em um erro que não se resolve sozinho. Repetir daria o mesmo resultado, então nenhuma nova tentativa foi feita.",
};

/** Hora local (São Paulo) no formato HH:MM:SS. */
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

/** Duração compacta: 4min25s, 1h02min, 12s. */
function duracao(inicio: string, fim: string): string {
  const total = Math.max(0, Math.round((+new Date(fim) - +new Date(inicio)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent" | "danger" | "muted";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-micro text-text-muted">{label}</p>
      <p
        className={cn(
          "tnum mt-1 text-body font-medium",
          tone === "accent" && "text-accent",
          tone === "danger" && "text-danger",
          tone === "muted" && "text-text-secondary",
          !tone && "text-text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ExecutionProgress({ initialJob }: { initialJob: JobRow }) {
  const [job, setJob] = useState<JobRow>(initialJob);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [, startTransition] = useTransition();

  const isActive = job.status === "queued" || job.status === "running";

  useEffect(() => {
    if (!isActive) return;
    const handle = setInterval(() => {
      startTransition(async () => {
        const progress = await getJobProgressAction(job.id);
        if (progress.job) {
          setJob(progress.job);
          setUpdatedAt(new Date());
        }
        // Rede de segurança: se o encadeamento se perdeu, abrir o painel
        // reaciona o pipeline. Não substitui o encadeamento nem o Cron.
        await nudgeJobsAction();
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isActive, job.id]);

  const phaseIndex = PHASES.findIndex(
    (p) =>
      p.id === job.phase ||
      (job.phase === "SEARCH_REPLACEMENTS" && p.id === "SEARCH"),
  );

  // Progresso real, medido sobre a meta. Nunca uma estimativa de tempo.
  const qualifiedPct =
    job.target_qualified > 0
      ? Math.min(100, (job.count_qualified / job.target_qualified) * 100)
      : 0;

  // Análise: proporção do que já foi analisado sobre o que foi importado.
  const analyzedPct =
    job.count_new > 0
      ? Math.min(100, (job.count_analyzed / job.count_new) * 100)
      : 0;

  const partial =
    job.status === "completed" &&
    job.count_qualified < job.target_qualified &&
    job.finish_reason !== "meta_atingida";

  return (
    <section className="bg-surface-1/60 rounded-card border border-border-subtle p-5">
      {/* Cabeçalho: identificação e status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={STATUS_TONE[job.status] ?? "neutral"} />
            <h3 className="truncate text-body font-medium text-text-primary">
              Execução de prospecção
            </h3>
            <span className="text-micro text-text-muted">
              {STATUS_LABEL[job.status] ?? job.status}
            </span>
          </div>
          {job.started_at ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-micro text-text-muted">
              <span>
                Início:{" "}
                <span className="tnum text-text-secondary">
                  {hora(job.started_at)}
                </span>
              </span>
              <span>
                Término:{" "}
                <span className="tnum text-text-secondary">
                  {job.finished_at ? hora(job.finished_at) : "—"}
                </span>
              </span>
              <span>
                Duração:{" "}
                <span className="tnum text-text-secondary">
                  {duracao(
                    job.started_at,
                    job.finished_at ?? updatedAt.toISOString(),
                  )}
                </span>
              </span>
            </div>
          ) : (
            <p className="mt-1 text-micro text-text-muted">Aguardando início</p>
          )}
        </div>

        <div className="text-right">
          <p className="eyebrow">Qualificadas</p>
          <p className="tnum text-kpi-sm text-text-primary">
            <span className="text-accent">{job.count_qualified}</span>
            <span className="text-text-muted"> / {job.target_qualified}</span>
          </p>
        </div>
      </div>

      {/* Etapas do pipeline */}
      <ol className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {PHASES.map((phase, i) => {
          const done = phaseIndex > i || job.phase === "FINISHED";
          const current = phaseIndex === i && job.phase !== "FINISHED";
          return (
            <li key={phase.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-micro transition-colors",
                  current && "bg-accent/15 text-accent",
                  done && !current && "text-text-secondary",
                  !done && !current && "text-text-muted",
                )}
              >
                {phase.label}
              </span>
              {i < PHASES.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-3",
                    done ? "bg-accent/40" : "bg-border-subtle",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Onde a busca está agora — só quando há cursor real */}
      {job.current_city && isActive ? (
        <p className="mt-3 text-meta text-text-secondary">
          Pesquisando{" "}
          <span className="text-text-primary">{job.current_term}</span> em{" "}
          <span className="text-text-primary">
            {job.current_city} — {job.current_state}
          </span>
          {job.phase === "SEARCH_REPLACEMENTS" ? (
            <span className="text-text-muted"> (buscando substitutas)</span>
          ) : null}
        </p>
      ) : null}

      {/* Barras de progresso reais */}
      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-micro">
            <span className="text-text-muted">Meta qualificada</span>
            <span className="tnum text-text-secondary">
              {Math.round(qualifiedPct)}%
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${qualifiedPct}%` }}
            />
          </div>
        </div>
        {job.count_new > 0 ? (
          <div>
            <div className="flex items-center justify-between text-micro">
              <span className="text-text-muted">Análise das novas</span>
              <span className="tnum text-text-secondary">
                {job.count_analyzed} de {job.count_new}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="bg-text-secondary/50 h-full rounded-full transition-[width] duration-500"
                style={{ width: `${analyzedPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Contadores — o funil completo, sem número inventado */}
      <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-3.5 border-t border-border-subtle pt-4 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Encontradas" value={job.results_raw} />
        <Metric label="Novas" value={job.count_new} />
        <Metric label="Já existentes" value={job.count_existing} tone="muted" />
        <Metric label="Duplicadas" value={job.count_duplicate} tone="muted" />
        <Metric label="Analisadas" value={job.count_analyzed} />
        <Metric
          label="Qualificadas"
          value={job.count_qualified}
          tone="accent"
        />
        {job.count_disqualified > 0 ? (
          <Metric label="Desclassificadas" value={job.count_disqualified} />
        ) : null}
        {job.count_invalid > 0 ? (
          <Metric label="Inválidas" value={job.count_invalid} tone="muted" />
        ) : null}
        {job.count_suppressed > 0 ? (
          <Metric
            label="Bloqueadas"
            value={job.count_suppressed}
            tone="muted"
          />
        ) : null}
        {job.count_failed > 0 ? (
          <Metric label="Falhas" value={job.count_failed} tone="danger" />
        ) : null}
        {job.count_replacements > 0 ? (
          <Metric label="Substituições" value={job.count_replacements} />
        ) : null}
      </div>

      {/* Conclusão parcial: explicar, nunca deixar "55 de 100" sem contexto */}
      {partial && job.finish_reason ? (
        <div className="bg-surface-2/60 mt-4 rounded-card border border-border-subtle p-3.5">
          <p className="text-meta text-text-primary">
            Entregou {job.count_qualified} de {job.target_qualified}{" "}
            oportunidades qualificadas.
          </p>
          <p className="mt-1 text-micro leading-relaxed text-text-secondary">
            {FINISH_REASON[job.finish_reason] ?? job.finish_reason}
          </p>
        </div>
      ) : null}

      {/* Erro sanitizado — nunca stack trace nem SQL */}
      {job.status === "failed" && job.last_error ? (
        <div className="border-danger/25 bg-danger/5 mt-4 rounded-card border p-3.5">
          <p className="text-meta text-text-primary">{job.last_error}</p>
        </div>
      ) : null}

      {/* O progresso é lido do banco; manter esta aba aberta é o que hoje
          garante o encadeamento dos ticks até existir um Cron por minuto. */}
      <p className="mt-3.5 text-micro text-text-muted">
        {isActive
          ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR")} · mantenha esta aba aberta até a execução concluir`
          : null}
      </p>
    </section>
  );
}
