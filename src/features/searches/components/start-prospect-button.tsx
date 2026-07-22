"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startProspectJobAction,
  getActiveJobForProfileAction,
} from "@/server/actions/jobs";

interface StartProspectButtonProps {
  profileId: string;
  /** Meta de empresas qualificadas; sem valor, usa o limite diário do perfil. */
  targetQualified?: number;
  /**
   * Execução em andamento para este perfil, resolvida no servidor. Deixa o
   * botão já desabilitado na primeira renderização, sem piscar "Iniciar".
   */
  activeJobId?: string | null;
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
 * Proteção contra duplicidade em cinco camadas, das mais rápidas às mais
 * confiáveis:
 *   1. `sending` (ref) barra o segundo clique antes de qualquer requisição;
 *   2. `disabled` impede o clique enquanto a solicitação está em curso;
 *   3. `activeJobId` (servidor) desabilita o botão quando já há execução;
 *   4. a Server Action devolve o job em andamento em vez de criar outro;
 *   5. `uq_job_queue_active_profile` arbitra a corrida no banco.
 *
 * As cinco são necessárias: (1) e (2) não cobrem duas abas nem dois
 * dispositivos; (3) e (4) são TOCTOU; só (5) é atômica.
 */
export function StartProspectButton({
  profileId,
  targetQualified,
  activeJobId = null,
  size = "sm",
}: StartProspectButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState<boolean>(Boolean(activeJobId));
  const [error, setError] = useState<string | null>(null);
  // Guarda síncrona: setPending só reflete no próximo render, então dois
  // cliques rápidos passariam pela checagem de `pending`.
  const sending = useRef(false);

  // Outra aba (ou o agendador) pode ter iniciado uma execução depois que esta
  // página foi renderizada. Uma checagem na montagem cobre esse caso sem
  // introduzir polling — quem acompanha progresso é a Visão geral.
  useEffect(() => {
    if (activeJobId) return;
    let cancelled = false;
    void getActiveJobForProfileAction(profileId).then((jobId) => {
      if (!cancelled && jobId) setRunning(true);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, activeJobId]);

  const onClick = useCallback(async () => {
    if (sending.current || running) return;
    sending.current = true;
    setPending(true);
    setError(null);

    try {
      const result = await startProspectJobAction(
        profileId,
        targetQualified ?? 0,
      );

      if (!result.ok) {
        setError(result.error ?? "Não foi possível iniciar a prospecção.");
        return;
      }

      // O servidor recusou criar uma segunda execução e devolveu a que já
      // estava rodando. O botão passa a refletir isso.
      if (result.alreadyRunning) setRunning(true);

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
  }, [profileId, targetQualified, running, router]);

  const disabled = pending || running;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        size={size}
        disabled={disabled}
        aria-busy={pending}
        onClick={onClick}
      >
        <Play />
        {running
          ? "Prospecção em andamento"
          : pending
            ? "Iniciando..."
            : "Iniciar prospecção"}
      </Button>
      {running ? (
        <span className="text-xs text-text-muted">
          Acompanhe o progresso na Visão geral.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
