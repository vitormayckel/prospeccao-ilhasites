import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Campos usam fundo mais profundo que a superfície ao redor: o input parece
 * escavado, não empilhado. Vale para input, textarea e select trigger.
 */
const fieldClassName = cn(
  "w-full rounded-control border border-border bg-surface-deep/50 text-sm text-text-primary transition-colors [color-scheme:dark]",
  "placeholder:text-text-muted",
  "hover:border-border-strong",
  "focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
  "read-only:cursor-default read-only:text-text-secondary read-only:hover:border-border",
);

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(fieldClassName, "flex h-9 px-3", className)}
    {...props}
  />
));
Input.displayName = "Input";

export { Input, fieldClassName };
