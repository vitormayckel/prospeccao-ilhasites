"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/ui/field";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import {
  APPROACH_CHANNEL,
  CONTACT_ROLE,
  NEXT_ACTION_STATUS,
  type ApproachChannel,
  type ContactRole,
  type NextActionStatus,
} from "@/types/domain";
import {
  approachChannelLabel,
  contactRoleLabel,
  nextActionStatusLabel,
} from "@/features/opportunities/labels";
import {
  setApproachChannelAction,
  setContactRoleAction,
  setNextActionStatusAction,
} from "@/server/actions/opportunities";

/**
 * Classificação comercial rápida da oportunidade (Sprint 4 §2/§3/§4): canal,
 * interlocutor e status da próxima ação. Alteração imediata via server action;
 * cada mudança entra no Timeline. Não altera fluxo de mensagens.
 */
export function CommercialControls({
  companyId,
  approachChannel,
  contactRole,
  nextActionStatus,
}: {
  companyId: string;
  approachChannel: ApproachChannel;
  contactRole: ContactRole | null;
  nextActionStatus: NextActionStatus | null;
}) {
  const { isPending, error, run } = useAsyncAction();

  return (
    <div className="space-y-4">
      <Field label="Canal de abordagem">
        <NativeSelect
          value={approachChannel}
          disabled={isPending}
          onChange={(e) =>
            run(() =>
              setApproachChannelAction(
                companyId,
                e.target.value as ApproachChannel,
              ),
            )
          }
        >
          {APPROACH_CHANNEL.map((c) => (
            <option key={c} value={c}>
              {approachChannelLabel[c]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Contato (com quem falamos)">
        <NativeSelect
          value={contactRole ?? ""}
          disabled={isPending}
          onChange={(e) =>
            run(() =>
              setContactRoleAction(
                companyId,
                (e.target.value || null) as ContactRole | null,
              ),
            )
          }
        >
          <option value="">Não classificado</option>
          {CONTACT_ROLE.map((r) => (
            <option key={r} value={r}>
              {contactRoleLabel[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Próxima ação">
        <NativeSelect
          value={nextActionStatus ?? ""}
          disabled={isPending}
          onChange={(e) =>
            run(() =>
              setNextActionStatusAction(
                companyId,
                (e.target.value || null) as NextActionStatus | null,
              ),
            )
          }
        >
          <option value="">Não definida</option>
          {NEXT_ACTION_STATUS.map((s) => (
            <option key={s} value={s}>
              {nextActionStatusLabel[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {error ? <p className="text-micro text-danger">{error}</p> : null}
    </div>
  );
}
