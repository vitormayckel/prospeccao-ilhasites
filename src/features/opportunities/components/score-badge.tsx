import { cn } from "@/lib/utils";

/** Traduz o score em faixa de cor (Blueprint §9.3). */
function scoreTone(score: number): { text: string; bar: string } {
  if (score >= 80) return { text: "text-success", bar: "bg-success" };
  if (score >= 65) return { text: "text-accent", bar: "bg-accent" };
  if (score >= 45) return { text: "text-info", bar: "bg-info" };
  return { text: "text-text-muted", bar: "bg-text-muted" };
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

export { ScoreBadge, scoreTone };
