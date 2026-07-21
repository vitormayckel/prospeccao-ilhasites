"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startProspectJobAction } from "@/server/actions/jobs";

interface StartProspectButtonProps {
  profileId: string;
  /** Meta de empresas qualificadas; sem valor, usa o limite diário do perfil. */
  targetQualified?: number;
  size?: "sm" | "md";
}

/**
 * Inicia a prospecção como execução persistente no servidor.
 *
 * Substitui o antigo "Executar agora", que rodava a coleta dentro da própria
 * requisição: se o usuário fechasse a aba no meio, o trabalho morria. Aqui a
 * ação só CRIA o job e dispara o primeiro tick — o pipeline continua no
 * servidor, e o navegador serve apenas para acompanhar.
 *
 * Proteção contra duplicidade em três camadas:
 *   1. `sending` (ref) barra o segundo clique antes de qualquer requisição;
 *   2. `disabled` impede o clique enquanto a solicitação está em curso;
 *   3. o servidor devolve o job em andamento em vez de criar outro.
 * As três são necessárias: (1) e (2) não cobrem duas abas abertas.
 */
export function StartProspectButton({
  profileId,
  targetQualified,
  size = "sm",
}: StartProspectButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guarda síncrona: setPending só reflete no próximo render, então dois
  // cliques rápidos passariam pela checagem de `pending`.
  const sending = useRef(false);

  async function onClick() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);

    try {
      const result = await startProspectJobAction(profileId, targetQualified ?? 0);

      if (!result.ok) {
        setError(result.error ?? "Não foi possível iniciar a prospecção.");
        return;
      }

      // Progresso ao vivo mora na Visão geral. Mantemos `pending` ligado até
      // a navegação concluir: soltar o botão antes convidaria a um 2º clique.
      router.push("/");
      router.refresh();
    } catch {
      // Falha de rede/servidor: nunca vaza detalhe técnico para a tela.
      setError("Não foi possível iniciar a prospecção. Tente novamente.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        size={size}
        disabled={pending}
        aria-busy={pending}
        onClick={onClick}
      >
        <Play />
        {pending ? "Iniciando..." : "Iniciar prospecção"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
