import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Hierarquia: uma única ação primária por contexto. "secondary" carrega as
 * ações de apoio, "ghost" as de navegação. O dourado nunca se repete na
 * mesma linha de botões.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[13px] font-medium transition-[color,background-color,border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-black hover:bg-accent-hover active:bg-accent",
        secondary:
          "border border-border-subtle bg-surface-2 text-text-primary hover:border-border hover:bg-surface-3",
        outline:
          "border border-border text-text-secondary hover:border-border-strong hover:bg-surface-1 hover:text-text-primary",
        ghost: "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        danger: "bg-danger/90 text-white hover:bg-danger",
      },
      size: {
        xs: "h-7 gap-1.5 px-2.5 text-micro [&_svg]:size-3.5",
        sm: "h-8 px-3",
        md: "h-9 px-3.5",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
