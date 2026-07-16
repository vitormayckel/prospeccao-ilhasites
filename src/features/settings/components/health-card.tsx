import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import type { HealthTone } from "@/server/services/health-service";

export type CardTone = HealthTone | "info";

const toneToStatus: Record<CardTone, StatusTone> = {
  ok: "success",
  warn: "warning",
  error: "danger",
  info: "neutral",
};

const toneLabel: Record<CardTone, string> = {
  ok: "OK",
  warn: "Atenção",
  error: "Falha",
  info: "—",
};

/** Card simples do painel de Saúde: título, status colorido e conteúdo. */
export function HealthCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: CardTone;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className="size-3.5 shrink-0 text-text-muted"
            strokeWidth={1.75}
          />
          <h3 className="truncate text-label text-text-primary">{title}</h3>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-micro font-medium",
            tone === "ok" && "text-success",
            tone === "warn" && "text-warning",
            tone === "error" && "text-danger",
            tone === "info" && "text-text-muted",
          )}
        >
          <StatusDot tone={toneToStatus[tone]} />
          {toneLabel[tone]}
        </span>
      </div>
      <div className="text-meta text-text-secondary">{children}</div>
    </Card>
  );
}
