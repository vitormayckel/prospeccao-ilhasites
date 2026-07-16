"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
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
import { MESSAGE_KIND, type MessageKind } from "@/types/domain";
import { createTemplateAction } from "@/server/actions/templates";
import type { ActionResult } from "@/server/actions/opportunities";

const kindLabel: Record<MessageKind, string> = {
  first_contact: "Primeira abordagem",
  follow_up: "Follow-up",
  reactivation: "Reativação",
  last_attempt: "Última tentativa",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Criar template"}
    </Button>
  );
}

export function CreateTemplateDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    createTemplateAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Novo template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
          <DialogDescription>
            Use variáveis como {"{{company_name}}"}, {"{{city}}"} e{" "}
            {"{{category}}"}.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <Field label="Nome" htmlFor="tpl-name">
            <Input id="tpl-name" name="name" required maxLength={120} />
          </Field>
          <Field label="Categoria" htmlFor="tpl-cat">
            <NativeSelect id="tpl-cat" name="category" required>
              {MESSAGE_KIND.map((k) => (
                <option key={k} value={k}>
                  {kindLabel[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Conteúdo"
            htmlFor="tpl-content"
            hint="As variáveis são substituídas na hora de compor a mensagem."
          >
            <Textarea id="tpl-content" name="content" required rows={5} />
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
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
