import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Ponto de status: comunica estado sem gastar uma badge. É a forma preferida
 * dentro de tabelas e listas densas, onde pílulas coloridas viram ruído.
 */
const statusDotVariants = cva("shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-text-muted",
      accent: "bg-accent",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
      info: "bg-info",
    },
    size: {
      sm: "size-1.5",
      md: "size-2",
    },
    pulse: {
      true: "animate-pulse",
      false: "",
    },
  },
  defaultVariants: { tone: "neutral", size: "sm", pulse: false },
});

export type StatusTone = NonNullable<
  VariantProps<typeof statusDotVariants>["tone"]
>;

export interface StatusDotProps extends VariantProps<typeof statusDotVariants> {
  className?: string;
}

function StatusDot({ tone, size, pulse, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn(statusDotVariants({ tone, size, pulse }), className)}
    />
  );
}

export { StatusDot, statusDotVariants };
