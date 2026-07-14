import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "bg-surface-deep/40 flex h-9 w-full rounded-control border border-border px-3 text-sm text-text-primary transition-colors",
      "placeholder:text-text-muted",
      "focus-visible:border-accent/50 focus-visible:ring-accent/30 focus-visible:outline-none focus-visible:ring-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
