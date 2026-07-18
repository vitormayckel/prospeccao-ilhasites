import { cn } from "@/lib/utils";

/** Traduz o score em faixa de cor (Blueprint §9.3). */
function scoreTone(score: number): { text: string; bar: string } {
  if (score >= 80) return { text: "text-success", bar: "bg-success" };
  if (score >= 65) return { text: "text-accent", bar: "bg-accent" };
  if (score >= 45) return { text: "text-info", bar: "bg-info" };
  return { text: "text-text-muted", bar: "bg-text-muted" };
}

/** Rótulo de prioridade derivado da faixa do score (leitura de relance). */
function scoreLabel(score: number): string {
  if (score >= 80) return "Alta prioridade";
  if (score >= 65) return "Boa oportunidade";
  if (score >= 45) return "Média prioridade";
  return "Baixa prioridade";
}

interface ScoreBadgeProps {
  score: number;
  /** Sem o medidor o score vira só número — para linhas muito densas. */
  meter?: boolean;
  size?: "sm" | "lg";
  className?: string;
}

/*
 * Score como micro-medidor em vez de pílula: o número dá o valor exato e a
 * barra dá a leitura periférica, sem somar mais uma badge colorida à tela.
 */
function ScoreBadge({
  score,
  meter = true,
  size = "sm",
  className,
}: ScoreBadgeProps) {
  const tone = scoreTone(score);
  const clamped = Math.min(Math.max(score, 0), 100);
  return (
    <span
      className={cn("inline-flex flex-col gap-1", className)}
      title={`Score ${score} de 100`}
    >
      <span
        className={cn(
          "tnum font-mono font-semibold leading-none",
          size === "lg" ? "text-kpi-sm" : "text-meta",
          tone.text,
        )}
      >
        {score}
      </span>
      {meter ? (
        <span
          aria-hidden
          className={cn(
            "block overflow-hidden rounded-full bg-surface-3",
            size === "lg" ? "mt-1 h-1 w-16" : "h-[3px] w-8",
          )}
        >
          <span
            className={cn("block h-full rounded-full", tone.bar)}
            style={{ width: `${clamped}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

/*
 * Score como manchete (tela de detalhe): número grande na cor da faixa, com o
 * rótulo de prioridade logo abaixo e um medidor fino. É o elemento de maior
 * destaque da página — o operador lê a prioridade antes de qualquer texto.
 */
function ScoreHeadline({ score }: { score: number }) {
  const tone = scoreTone(score);
  const clamped = Math.min(Math.max(score, 0), 100);
  return (
    <div className="flex flex-col items-start" title={`Score ${score} de 100`}>
      <span className="eyebrow mb-1.5">Score</span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn("tnum font-mono text-kpi leading-none", tone.text)}>
          {score}
        </span>
        <span className="text-meta text-text-muted">/100</span>
      </span>
      <span
        aria-hidden
        className="mt-2 block h-1 w-28 overflow-hidden rounded-full bg-surface-3"
      >
        <span
          className={cn("block h-full rounded-full", tone.bar)}
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className={cn("mt-2 text-meta font-medium", tone.text)}>
        {scoreLabel(score)}
      </span>
    </div>
  );
}

export { ScoreBadge, ScoreHeadline, scoreTone, scoreLabel };
