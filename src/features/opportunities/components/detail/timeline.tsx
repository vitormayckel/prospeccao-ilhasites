import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  TimelineEvent,
  TimelineTone,
} from "@/features/opportunities/lib/build-timeline";

const dotTone: Record<TimelineTone, string> = {
  neutral: "bg-text-muted",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

/**
 * Histórico cronológico da oportunidade (Sprint 4, §1). Mais recente primeiro,
 * com data, hora, tipo e descrição. Read-only — os eventos vêm das fontes que
 * já persistem, agregadas em buildTimeline().
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Fio + nó da linha do tempo. */}
            <div className="relative flex w-3 shrink-0 justify-center">
              {!last ? (
                <span
                  aria-hidden
                  className="absolute top-2 h-full w-px bg-border-subtle"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative mt-1 size-2 shrink-0 rounded-full ring-4 ring-surface-1",
                  dotTone[e.tone],
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="min-w-0 text-meta font-medium text-text-primary">
                  {e.title}
                </p>
                <time className="tnum shrink-0 text-micro text-text-muted">
                  {formatDateTime(e.at)}
                </time>
              </div>
              {e.detail ? (
                <p className="mt-0.5 break-words text-micro leading-relaxed text-text-muted">
                  {e.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
