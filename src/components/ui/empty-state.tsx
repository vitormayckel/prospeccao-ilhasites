import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Sem borda tracejada: o vazio é um estado do produto, não um espaço faltando.
 * Use "inline" quando o estado vazio já vive dentro de um bloco com moldura.
 */
const emptyStateVariants = cva(
  "flex flex-col items-center justify-center px-6 text-center",
  {
    variants: {
      variant: {
        framed:
          "rounded-card border border-border-subtle bg-surface-1/40 py-20",
        inline: "py-12",
      },
    },
    defaultVariants: { variant: "framed" },
  },
);

interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Estado vazio padrão para telas sem dados. */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ variant }), className)}>
      {Icon ? (
        <Icon className="text-text-muted/70 mb-4 size-6" strokeWidth={1.5} />
      ) : null}
      <p className="text-body font-medium text-text-primary">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[42ch] text-meta leading-relaxed text-text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
