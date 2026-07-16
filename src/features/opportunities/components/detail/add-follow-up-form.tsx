"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createFollowUpAction,
  type ActionResult,
} from "@/server/actions/opportunities";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Agendando..." : "Agendar follow-up"}
    </Button>
  );
}

export function AddFollowUpForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    createFollowUpAction,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      <Input
        type="datetime-local"
        name="dueAt"
        required
        aria-label="Data do follow-up"
      />
      <Input name="notes" placeholder="Observação (opcional)" />
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
