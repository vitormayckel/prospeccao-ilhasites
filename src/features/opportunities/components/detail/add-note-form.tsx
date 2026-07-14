"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
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
      <textarea
        name="content"
        required
        rows={3}
        placeholder="Escreva uma nota sobre esta empresa..."
        className="bg-surface-deep/40 focus-visible:border-accent/50 focus-visible:ring-accent/30 w-full resize-none rounded-control border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2"
      />
      <div className="flex items-center justify-between">
        {state && !state.ok ? (
          <span className="text-xs text-danger">{state.error}</span>
        ) : (
          <span />
        )}
        <SubmitButton />
      </div>
    </form>
  );
}
