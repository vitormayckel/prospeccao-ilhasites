import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** Agrupamento padrão de formulário: rótulo, campo e texto de apoio. */
function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-micro font-medium text-text-secondary"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-micro text-text-muted">{hint}</p> : null}
    </div>
  );
}

interface FieldsetProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** Seção de formulário: agrupa campos relacionados sob um título editorial. */
function Fieldset({ title, description, children, className }: FieldsetProps) {
  return (
    <section
      className={cn("grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]", className)}
    >
      <div className="space-y-1">
        <h3 className="text-heading text-text-primary">{title}</h3>
        {description ? (
          <p className="text-meta text-text-secondary">{description}</p>
        ) : null}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export { Field, Fieldset };
