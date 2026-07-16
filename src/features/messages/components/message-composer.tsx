"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { MessageKind } from "@/types/domain";
import { buildWhatsappDeepLink } from "@/lib/whatsapp-link";
import {
  openWhatsappMessageAction,
  confirmMessageSentAction,
  markMessageNotSentAction,
} from "@/server/actions/messages";

const kindLabel: Record<MessageKind, string> = {
  first_contact: "Primeira abordagem",
  follow_up: "Follow-up",
  reactivation: "Reativação",
  last_attempt: "Última tentativa",
};

export interface ComposerTemplate {
  id: string;
  name: string;
  category: MessageKind;
  resolvedContent: string;
}

interface MessageComposerProps {
  companyId: string;
  companyName: string;
  phoneE164: string | null;
  phoneDisplay: string | null;
  templates: ComposerTemplate[];
  triggerLabel?: string;
}

/** Compositor de mensagem manual (Blueprint §12.4, RF-11, RN-02/03). */
export function MessageComposer({
  companyId,
  companyName,
  phoneE164,
  phoneDisplay,
  templates,
  triggerLabel = "Preparar mensagem",
}: MessageComposerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [content, setContent] = useState(templates[0]?.resolvedContent ?? "");
  const [messageId, setMessageId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = templates.find((t) => t.id === templateId);
  const phone = phoneE164 ?? phoneDisplay;
  const link = phone ? buildWhatsappDeepLink(phone, content) : null;
  const unresolved = useMemo(
    () => (content.match(/\{\{\s*[a-z_]+\s*\}\}/g) ?? []).length,
    [content],
  );

  function reset() {
    setMessageId(null);
    setError(null);
    setTemplateId(templates[0]?.id ?? "");
    setContent(templates[0]?.resolvedContent ?? "");
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setContent(tpl.resolvedContent);
  }

  function onOpenWhatsapp() {
    setError(null);
    if (!link) {
      setError("Telefone inválido — não é possível abrir o WhatsApp.");
      return;
    }
    // Abre de forma síncrona (evita bloqueio de pop-up) — RN-02: só abre.
    window.open(link, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const result = await openWhatsappMessageAction({
        companyId,
        templateId: selected?.id ?? null,
        type: selected?.category ?? "first_contact",
        content,
        phoneE164: phone,
      });
      if (!result.ok) setError(result.error ?? "Falha ao registrar abertura.");
      else setMessageId(result.messageId ?? null);
    });
  }

  function onConfirm(sent: boolean) {
    if (!messageId) return;
    startTransition(async () => {
      const result = sent
        ? await confirmMessageSentAction(messageId)
        : await markMessageNotSentAction(messageId);
      if (!result.ok) {
        setError(result.error ?? "Falha ao atualizar.");
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Não foi possível copiar.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={templates.length === 0}>
          <MessageCircle />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preparar abordagem</DialogTitle>
          <DialogDescription>
            {companyName}
            {phoneDisplay ? ` · ${phoneDisplay}` : ""}
          </DialogDescription>
        </DialogHeader>

        {templates.length === 0 ? (
          <p className="text-meta text-text-secondary">
            Nenhum template ativo.{" "}
            <Link
              href="/messages/templates"
              className="text-accent hover:underline"
            >
              Criar template
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Template" htmlFor="composer-template">
              <NativeSelect
                id="composer-template"
                value={templateId}
                onChange={(e) => onSelectTemplate(e.target.value)}
                disabled={!!messageId}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {kindLabel[t.category]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={!!messageId}
              rows={7}
              aria-label="Conteúdo da mensagem"
              className="resize-y"
            />

            <p className="text-micro text-text-muted">
              Caracteres: {content.length}
              {unresolved > 0 ? (
                <span className="ml-2 text-warning">
                  {unresolved} variável(is) não preenchida(s)
                </span>
              ) : (
                <span className="ml-2 text-success">variáveis resolvidas</span>
              )}
            </p>

            {error ? <p className="text-micro text-danger">{error}</p> : null}

            {!messageId ? (
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="ghost" size="sm" onClick={onCopy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  size="sm"
                  onClick={onOpenWhatsapp}
                  disabled={isPending || !content.trim()}
                >
                  <MessageCircle />
                  Abrir WhatsApp
                </Button>
              </DialogFooter>
            ) : (
              <div className="space-y-3 border-t border-border-subtle pt-4">
                <p className="text-meta text-text-secondary">
                  Você enviou a mensagem pelo WhatsApp?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onConfirm(false)}
                    disabled={isPending}
                  >
                    Não enviei
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onConfirm(true)}
                    disabled={isPending}
                  >
                    <Check />
                    Marcar como enviada
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
