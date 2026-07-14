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
import { createSearchProfileAction } from "@/server/actions/search-profiles";
import type { ActionResult } from "@/server/actions/opportunities";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Criar perfil"}
    </Button>
  );
}

export function CreateSearchProfileDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    createSearchProfileAction,
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
          Novo perfil
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo perfil de pesquisa</DialogTitle>
          <DialogDescription>
            Defina cidades e categorias. A coleta será executada em fase futura.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <Field label="Nome">
            <Input
              name="name"
              required
              placeholder="Ex.: Grande Vitória — serviços"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="UF">
              <Input name="state" defaultValue="ES" maxLength={2} />
            </Field>
            <Field label="Horário">
              <Input name="runTime" type="time" defaultValue="07:00" />
            </Field>
          </div>
          <Field label="Cidades (separadas por vírgula)">
            <Input
              name="cities"
              required
              placeholder="Vitória, Vila Velha, Serra"
            />
          </Field>
          <Field label="Categorias (separadas por vírgula)">
            <Input
              name="categories"
              required
              placeholder="Contabilidade, Advocacia"
            />
          </Field>
          <Field label="Limite diário">
            <Input name="dailyLimit" type="number" defaultValue={50} min={1} />
          </Field>
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
