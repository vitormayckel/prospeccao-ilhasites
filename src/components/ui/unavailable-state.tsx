"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UnavailableStateProps {
  /** Mensagem já sanitizada pelo servidor. Nunca receber erro bruto aqui. */
  message?: string;
  /** ID de correlação para o operador citar ao reportar o problema. */
  correlationId?: string;
  variant?: "framed" | "inline";
  className?: string;
}

/**
 * Estado de indisponibilidade de um bloco isolado da página. Diferente de
 * EmptyState: aqui não há dado porque a leitura falhou, não porque não
 * existe — a distinção importa para o operador não ler zero como fato.
 */
function UnavailableState({
  message = "Não foi possível carregar estes dados agora.",
  correlationId,
  variant = "framed",
  className,
}: UnavailableStateProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        variant === "framed"
          ? "rounded-card border border-border-subtle bg-surface-1/40 py-14"
          : "py-10",
        className,
      )}
    >
      <CloudOff className="mb-3.5 size-5 text-text-muted/70" strokeWidth={1.5} />
      <p className="text-meta leading-relaxed text-text-secondary">{message}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-4"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {isPending ? "Tentando..." : "Tentar novamente"}
      </Button>
      {correlationId ? (
        <p className="mt-2 text-micro text-text-muted">ref: {correlationId}</p>
      ) : null}
    </div>
  );
}

export { UnavailableState };
