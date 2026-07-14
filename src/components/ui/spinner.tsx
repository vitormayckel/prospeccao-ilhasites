import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Indicador de carregamento minimalista. */
function Spinner({
  className,
  label = "Carregando",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2
        className={cn("size-4 animate-spin text-text-muted", className)}
      />
    </span>
  );
}

export { Spinner };
