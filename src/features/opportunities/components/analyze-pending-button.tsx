"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import {
  startAnalysisRecoveryAction,
  getActiveRecoveryJobAction,
} from "@/server/actions/analysis";
import { getJobProgressAction, nudgeJobsAction } from "@/server/actions/jobs";

/**
 * Recuperação da fila de análise — UM clique, o servidor conclui.
 *
 * Antes era um lote síncrono de 3 empresas por clique: 22 empresas exigiam 8
 * cliques. Agora o clique cria um job na fila e o encadeamento de ticks o
 * leva até zerar; este componente só acompanha, exatamente como o painel de
 * progresso da prospecção.
 *
 * Continua fora do fluxo normal: a análise é disparada pelo próprio pipeline
 * logo após a deduplicação. Isto existe para destravar empresas cuja análise
 * falhou — indisponibilidade da IA, saldo, timeout.
 */
const POLL_INTERVAL_MS = 5_000;

export function AnalyzePendingButton({ pending }: { pending: number }) {
  const router = useRouter();
  const { isPending, error, run } = useAsyncAction();
  const [jobId, setJobId] = useState<string | null>(null);
  const [feito, setFeito] = useState(0);
  const [total, setTotal] = useState(pending);
  const [, startTransition] = useTransition();

  // Retoma o acompanhamento ao recarregar a página com um job em andamento.
  useEffect(() => {
    let vivo = true;
    getActiveRecoveryJobAction().then((id) => {
      if (vivo && id) setJobId(id);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const handle = setInterval(() => {
      startTransition(async () => {
        const { job } = await getJobProgressAction(jobId);
        if (!job) return;
        setFeito(job.count_analyzed + job.count_failed);
        setTotal(job.target_qualified);

        if (job.status === "completed" || job.status === "failed") {
          setJobId(null);
          router.refresh(); // a fila volta preenchida e ordenada
          return;
        }
        // Rede de segurança: se o encadeamento se perdeu, o acompanhamento
        // reaciona o pipeline. Mesmo papel do painel de execução.
        await nudgeJobsAction();
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [jobId, router]);

  function onClick() {
    run(() => startAnalysisRecoveryAction(), {
      // `refresh` desligado: o acompanhamento abaixo é que atualiza a fila, ao
      // final. Recarregar agora só piscaria a tela sem nenhum dado novo.
      refresh: false,
      onSuccess: (r) => {
        if (r.jobId) setJobId(r.jobId);
        setTotal(r.total ?? pending);
      },
    });
  }

  const emAndamento = jobId !== null;
  if (pending === 0 && !emAndamento && !error) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending || emAndamento || pending === 0}
        onClick={onClick}
      >
        {emAndamento ? <Loader2 className="animate-spin" /> : <LifeBuoy />}
        {emAndamento
          ? `Recuperando análises ${feito}/${total}`
          : `Recuperar análises (${pending})`}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
