import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-normal transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border-subtle bg-surface-2 text-text-secondary",
        accent: "border-accent/15 bg-accent-soft text-accent",
        success: "border-success/15 bg-success/12 text-success",
        warning: "border-warning/15 bg-warning/12 text-warning",
        danger: "border-danger/15 bg-danger/12 text-danger",
        info: "border-info/15 bg-info/12 text-info",
        outline: "border-border text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
