import { Badge, type BadgeProps } from "@/components/ui/badge";

/** Traduz o score em faixa de cor (Blueprint §9.3). */
function scoreVariant(score: number): BadgeProps["variant"] {
  if (score >= 80) return "success";
  if (score >= 65) return "accent";
  if (score >= 45) return "info";
  return "neutral";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <Badge variant={scoreVariant(score)} className="font-mono">
      {score}
    </Badge>
  );
}

export { ScoreBadge };
