import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rótulo discreto acima do título — situa a página numa seção maior. */
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Cabeçalho padrão de página: título, descrição e ações. */
function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          /* Régua dourada curta: a assinatura que abre toda página do produto. */
          <p className="eyebrow flex items-center gap-2.5">
            <span aria-hidden className="bg-accent/60 h-px w-6" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-display text-text-primary">{title}</h1>
        {description ? (
          <p className="max-w-[68ch] text-body text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export { PageHeader };
