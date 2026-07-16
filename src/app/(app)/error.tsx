"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="mb-4 size-6 text-danger" strokeWidth={1.5} />
      <p className="text-body font-medium text-text-primary">
        Algo deu errado ao carregar esta página
      </p>
      <p className="mt-1.5 max-w-[42ch] text-meta leading-relaxed text-text-muted">
        Ocorreu um erro ao consultar os dados. Você pode tentar novamente.
      </p>
      <Button variant="secondary" className="mt-6" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  );
}
