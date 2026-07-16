"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addNoteAction,
  type ActionResult,
} from "@/server/actions/opportunities";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : "Adicionar nota"}
    </Button>
  );
}

export function AddNoteForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    addNoteAction,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      <Textarea
        name="content"
        required
        rows={3}
        placeholder="Escreva uma nota sobre esta empresa..."
      />
      <div className="flex items-center justify-between gap-2">
        {state && !state.ok ? (
          <span className="text-micro text-danger">{state.error}</span>
        ) : (
          <span />
        )}
        <SubmitButton />
      </div>
    </form>
  );
}
