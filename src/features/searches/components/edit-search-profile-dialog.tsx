"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { updateSearchProfileAction } from "@/server/actions/search-profiles";
import type { ActionResult } from "@/server/actions/opportunities";
import { cn } from "@/lib/utils";

/** Rótulos dos dias (1=seg … 7=dom), na ordem da semana comercial. */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

export interface EditableProfile {
  id: string;
  name: string;
  cities: string[];
  categories: string[];
  weekdays: number[];
  run_time: string;
  daily_limit: number;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar alterações"}
    </Button>
  );
}

/** Edição de um perfil existente (Sprint §1). Reaproveita o padrão do dialog
 *  de criação; controlado externamente pelo menu de ações. */
export function EditSearchProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: EditableProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    updateSearchProfileAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  const selected = new Set(profile.weekdays);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription>
            Ajuste cidades, categorias e a agenda de coleta.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={profile.id} />
          <Field label="Nome">
            <Input name="name" required defaultValue={profile.name} />
          </Field>
          <Field label="Cidades (separadas por vírgula)">
            <Input
              name="cities"
              required
              defaultValue={profile.cities.join(", ")}
              placeholder="Vitória, Vila Velha, Serra"
            />
          </Field>
          <Field label="Categorias (separadas por vírgula)">
            <Input
              name="categories"
              required
              defaultValue={profile.categories.join(", ")}
              placeholder="Contabilidade, Advocacia"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horário">
              <Input
                name="runTime"
                type="time"
                defaultValue={profile.run_time?.slice(0, 5) || "07:00"}
              />
            </Field>
            <Field label="Limite diário">
              <Input
                name="dailyLimit"
                type="number"
                min={1}
                defaultValue={profile.daily_limit}
              />
            </Field>
          </div>
          <Field label="Dias da semana">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <label
                  key={d.value}
                  className={cn(
                    "cursor-pointer select-none rounded-control border px-2.5 py-1 text-micro font-medium transition-colors",
                    "border-border-subtle text-text-muted hover:text-text-secondary",
                    "has-[:checked]:border-border-strong has-[:checked]:bg-surface-2 has-[:checked]:text-text-primary",
                  )}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.value}
                    defaultChecked={selected.has(d.value)}
                    className="sr-only"
                  />
                  {d.label}
                </label>
              ))}
            </div>
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
