"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogClose,
} from "@/components/ui/dialog";
import {
  MESSAGE_KIND_ORDER,
  MESSAGE_KIND_LABEL,
  MESSAGE_KIND_HELP,
  DEFAULT_TEMPLATE_KIND,
} from "@/lib/message-kind";
import type { MessageKind, MessageTemplateRow } from "@/types/domain";
import {
  createTemplateAction,
  updateTemplateAction,
} from "@/server/actions/templates";
import type { ActionResult } from "@/server/actions/opportunities";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

interface TemplateDialogProps {
  /** Ausente = criação. Presente = edição. */
  template?: MessageTemplateRow;
  /** Categoria pré-selecionada ao criar (default: saudação inicial). */
  defaultCategory?: MessageKind;
}

export function TemplateDialog({
  template,
  defaultCategory = DEFAULT_TEMPLATE_KIND,
}: TemplateDialogProps) {
  const isEdit = !!template;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MessageKind>(
    template?.category ?? defaultCategory,
  );
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    isEdit ? updateTemplateAction : createTemplateAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  // Ao reabrir, volta ao estado inicial da categoria.
  useEffect(() => {
    if (open) setCategory(template?.category ?? defaultCategory);
  }, [open, template?.category, defaultCategory]);

  const isGreeting = category === "greeting";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar ${template!.name}`}
          >
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar template" : "Novo template"}</DialogTitle>
          <DialogDescription>
            {isGreeting
              ? "Saudação curta, sem variáveis ou conteúdo comercial."
              : "Use variáveis como {{company_name}}, {{city}} e {{category}}."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          {isEdit ? (
            <input type="hidden" name="id" value={template!.id} />
          ) : null}
          <Field label="Nome" htmlFor="tpl-name">
            <Input
              id="tpl-name"
              name="name"
              required
              maxLength={120}
              defaultValue={template?.name}
            />
          </Field>
          <Field label="Categoria" htmlFor="tpl-cat" hint={MESSAGE_KIND_HELP[category]}>
            <NativeSelect
              id="tpl-cat"
              name="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value as MessageKind)}
            >
              {MESSAGE_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {MESSAGE_KIND_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Conteúdo"
            htmlFor="tpl-content"
            hint={
              isGreeting
                ? "Apenas o cumprimento. Ex.: “Bom dia!”, “Olá, tudo bem?”."
                : "As variáveis são substituídas na hora de compor a mensagem."
            }
          >
            <Textarea
              id="tpl-content"
              name="content"
              required
              rows={isGreeting ? 2 : 5}
              defaultValue={template?.content}
            />
          </Field>
          {state && !state.ok ? (
            <p className="text-micro text-danger">{state.error}</p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton label={isEdit ? "Salvar" : "Criar template"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
