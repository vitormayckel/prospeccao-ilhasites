"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="tpl-name"
              className="text-sm font-medium text-text-primary"
            >
              Nome
            </label>
            <Input id="tpl-name" name="name" required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="tpl-cat"
              className="text-sm font-medium text-text-primary"
            >
              Categoria
            </label>
            <select
              id="tpl-cat"
              name="category"
              required
              className="bg-surface-deep/40 focus-visible:border-accent/50 focus-visible:ring-accent/30 h-9 w-full rounded-control border border-border px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2"
            >
              {MESSAGE_KIND.map((k) => (
                <option key={k} value={k}>
                  {kindLabel[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="tpl-content"
              className="text-sm font-medium text-text-primary"
            >
              Conteúdo
            </label>
            <textarea
              id="tpl-content"
              name="content"
              required
              rows={5}
              className="bg-surface-deep/40 focus-visible:border-accent/50 focus-visible:ring-accent/30 w-full resize-none rounded-control border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2"
            />
          </div>
          {state && !state.ok ? (
            <p className="text-xs text-danger">{state.error}</p>
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
