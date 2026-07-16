import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Badge é para estado que muda; rótulo fixo é texto comum. Preferir "tone:
 * quiet" quando o estado já estiver claro pelo contexto — cor cheia só quando
 * o estado exige ação.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-label transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "",
        accent: "",
        success: "",
        warning: "",
        danger: "",
        info: "",
        outline: "",
      },
      tone: {
        soft: "border px-2 py-[3px]",
        quiet: "px-0 py-0",
      },
    },
    compoundVariants: [
      {
        tone: "soft",
        variant: "neutral",
        className: "border-border-subtle bg-surface-2 text-text-secondary",
      },
      {
        tone: "soft",
        variant: "accent",
        className: "border-accent/20 bg-accent-soft text-accent",
      },
      {
        tone: "soft",
        variant: "success",
        className: "border-success/20 bg-success/[0.10] text-success",
      },
      {
        tone: "soft",
        variant: "warning",
        className: "border-warning/20 bg-warning/[0.10] text-warning",
      },
      {
        tone: "soft",
        variant: "danger",
        className: "border-danger/20 bg-danger/[0.10] text-danger",
      },
      {
        tone: "soft",
        variant: "info",
        className: "border-info/20 bg-info/[0.10] text-info",
      },
      {
        tone: "soft",
        variant: "outline",
        className: "border-border text-text-secondary",
      },
      { tone: "quiet", variant: "neutral", className: "text-text-muted" },
      { tone: "quiet", variant: "accent", className: "text-accent" },
      { tone: "quiet", variant: "success", className: "text-success" },
      { tone: "quiet", variant: "warning", className: "text-warning" },
      { tone: "quiet", variant: "danger", className: "text-danger" },
      { tone: "quiet", variant: "info", className: "text-info" },
      { tone: "quiet", variant: "outline", className: "text-text-secondary" },
    ],
    defaultVariants: {
      variant: "neutral",
      tone: "soft",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
