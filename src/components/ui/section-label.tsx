import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  /** Conteúdo alinhado à direita, depois do fio (contagens, links, ações). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Marcador de seção: rótulo discreto + fio que atravessa a largura.
 * É o compasso do produto — repete-se entre telas para criar ritmo, e substitui
 * títulos de seção pesados que competiriam com o título da página.
 */
function SectionLabel({ children, actions, className }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <h2 className="eyebrow shrink-0">{children}</h2>
      <span aria-hidden className="h-px min-w-0 flex-1 bg-border-subtle" />
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export { SectionLabel };
