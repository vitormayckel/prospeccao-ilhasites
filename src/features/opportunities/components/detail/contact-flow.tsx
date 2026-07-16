"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Check, Reply, CalendarPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ContactStage } from "@/types/domain";
import {
  CONTACT_STAGE_LABEL,
  nextContactAction,
} from "@/lib/contact-flow";
import { buildWhatsappDeepLink } from "@/lib/whatsapp-link";
import {
  openGreetingAction,
  confirmGreetingSentAction,
  markRepliedAction,
  openCommercialAction,
  confirmCommercialSentAction,
  scheduleContactFollowUpAction,
  closeContactAction,
} from "@/server/actions/contact";

interface ContactFlowProps {
  companyId: string;
  phone: string | null;
  contactStage: ContactStage;
  suggestedGreeting: string;
  suggestedCommercial: string;
  greetingMessageId: string | null;
  commercialMessageId: string | null;
}

const CLOSEABLE: ContactStage[] = [
  "awaiting_reply",
  "replied",
  "commercial_prepared",
  "commercial_sent",
  "follow_up_scheduled",
];

/**
 * Condução do primeiro contato (regra central §1). Mostra SOMENTE a próxima
 * ação compatível com o estado (§7). O sistema nunca envia — apenas abre o
 * deep link e registra a confirmação manual.
 */
export function ContactFlow({
  companyId,
  phone,
  contactStage,
  suggestedGreeting,
  suggestedCommercial,
  greetingMessageId,
  commercialMessageId,
}: ContactFlowProps) {
  const router = useRouter();
  const action = nextContactAction(contactStage);
  const [greeting, setGreeting] = useState(suggestedGreeting);
  const [commercial, setCommercial] = useState(suggestedCommercial);
  const [followUpAt, setFollowUpAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noPhone = !phone;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Falha ao processar a ação.");
        return;
      }
      router.refresh();
    });
  }

  /** Abre o WhatsApp de forma síncrona (evita bloqueio de pop-up) e registra. */
  function openAndRecord(
    content: string,
    record: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    if (!phone) {
      setError("Sem telefone válido para abrir o WhatsApp.");
      return;
    }
    const link = buildWhatsappDeepLink(phone, content);
    if (!link) {
      setError("Telefone inválido — não é possível abrir o WhatsApp.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
    run(record);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={contactStage === "closed" ? "neutral" : "accent"}>
          {CONTACT_STAGE_LABEL[contactStage]}
        </Badge>
      </div>
      <p className="text-meta text-text-secondary">{action.hint}</p>

      {noPhone && contactStage !== "closed" ? (
        <p className="text-micro text-text-muted">
          Sem telefone para abordagem por WhatsApp.
        </p>
      ) : null}

      {/* Preparar saudação (só uma saudação curta) */}
      {action.id === "prepare_greeting" ? (
        <div className="space-y-2">
          <Textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={2}
            aria-label="Saudação"
            className="resize-y"
          />
          <p className="text-micro text-text-muted">
            Apenas a saudação. Sem apresentação, proposta ou link.
          </p>
          <Button
            size="sm"
            onClick={() =>
              openAndRecord(greeting, () =>
                openGreetingAction({ companyId, content: greeting, phoneE164: phone }),
              )
            }
            disabled={isPending || noPhone || !greeting.trim()}
          >
            <MessageCircle />
            Abrir WhatsApp com a saudação
          </Button>
        </div>
      ) : null}

      {/* Confirmar saudação enviada */}
      {action.id === "confirm_greeting_sent" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              greetingMessageId &&
              run(() => confirmGreetingSentAction(greetingMessageId))
            }
            disabled={isPending || !greetingMessageId}
          >
            <Check />
            Confirmar saudação enviada
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openAndRecord(suggestedGreeting, () =>
                openGreetingAction({
                  companyId,
                  content: suggestedGreeting,
                  phoneE164: phone,
                }),
              )
            }
            disabled={isPending || noPhone}
          >
            Abrir de novo
          </Button>
        </div>
      ) : null}

      {/* Marcar que o lead respondeu */}
      {action.id === "mark_replied" ? (
        <Button
          size="sm"
          onClick={() => run(() => markRepliedAction(companyId))}
          disabled={isPending}
        >
          <Reply />
          Lead respondeu
        </Button>
      ) : null}

      {/* Preparar mensagem comercial (após resposta) */}
      {action.id === "prepare_commercial" ? (
        <div className="space-y-2">
          <Textarea
            value={commercial}
            onChange={(e) => setCommercial(e.target.value)}
            rows={5}
            aria-label="Mensagem comercial"
            className="resize-y"
          />
          <p className="text-micro text-text-muted">
            Sugestão baseada na análise. Revise antes de abrir o WhatsApp.
          </p>
          <Button
            size="sm"
            onClick={() =>
              openAndRecord(commercial, () =>
                openCommercialAction({
                  companyId,
                  content: commercial,
                  phoneE164: phone,
                }),
              )
            }
            disabled={isPending || noPhone || !commercial.trim()}
          >
            <MessageCircle />
            Abrir WhatsApp com a mensagem
          </Button>
        </div>
      ) : null}

      {/* Confirmar mensagem comercial enviada */}
      {action.id === "confirm_commercial_sent" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              commercialMessageId &&
              run(() => confirmCommercialSentAction(commercialMessageId))
            }
            disabled={isPending || !commercialMessageId}
          >
            <Check />
            Confirmar mensagem enviada
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openAndRecord(suggestedCommercial, () =>
                openCommercialAction({
                  companyId,
                  content: suggestedCommercial,
                  phoneE164: phone,
                }),
              )
            }
            disabled={isPending || noPhone}
          >
            Abrir de novo
          </Button>
        </div>
      ) : null}

      {/* Agendar follow-up */}
      {action.id === "schedule_follow_up" ? (
        <div className="space-y-2">
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            aria-label="Data do follow-up"
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-meta text-text-primary"
          />
          <Button
            size="sm"
            onClick={() =>
              followUpAt &&
              run(() =>
                scheduleContactFollowUpAction({
                  companyId,
                  dueAt: new Date(followUpAt),
                }),
              )
            }
            disabled={isPending || !followUpAt}
          >
            <CalendarPlus />
            Agendar follow-up
          </Button>
        </div>
      ) : null}

      {/* Encerrar */}
      {action.id === "close" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => run(() => closeContactAction(companyId))}
          disabled={isPending}
        >
          <XCircle />
          Encerrar contato
        </Button>
      ) : null}

      {action.id === "none" ? (
        <p className="text-meta text-text-muted">
          Contato encerrado. Reabra pelo pipeline se precisar retomar.
        </p>
      ) : null}

      {error ? <p className="text-micro text-danger">{error}</p> : null}

      {/* Encerrar como ação secundária discreta, sem competir com a principal */}
      {CLOSEABLE.includes(contactStage) && action.id !== "close" ? (
        <button
          type="button"
          onClick={() => run(() => closeContactAction(companyId))}
          disabled={isPending}
          className="text-micro text-text-muted underline-offset-2 hover:text-text-secondary hover:underline disabled:opacity-50"
        >
          Encerrar contato
        </button>
      ) : null}
    </div>
  );
}
