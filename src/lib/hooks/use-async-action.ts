"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface BaseResult {
  ok: boolean;
  error?: string;
}

/**
 * Encapsula o padrão de Server Action disparada da UI: estado de pendência,
 * mensagem de sucesso/erro e revalidação (router.refresh). Evita repetir a
 * mesma lógica em cada botão de ação.
 */
export function useAsyncAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run<T extends BaseResult>(
    action: () => Promise<T>,
    options?: {
      successMessage?: (result: T) => string;
      onSuccess?: (result: T) => void;
      refresh?: boolean;
    },
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Falha na operação.");
        return;
      }
      if (options?.successMessage) setMessage(options.successMessage(result));
      options?.onSuccess?.(result);
      if (options?.refresh !== false) router.refresh();
    });
  }

  return { isPending, error, message, run };
}
