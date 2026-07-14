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
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="bg-danger/12 mb-4 flex size-11 items-center justify-center rounded-full text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">
        Algo deu errado ao carregar esta página
      </p>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        Ocorreu um erro ao consultar os dados. Você pode tentar novamente.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  );
}
