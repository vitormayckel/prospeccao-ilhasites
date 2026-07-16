import { UserCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Fieldset } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function SettingsGeneralPage() {
  const { repositories } = await createServerContext();
  const operator = await repositories.profiles.getFirst();

  if (!operator) {
    return (
      <EmptyState
        icon={UserCog}
        title="Sem operador"
        description="Nenhum operador cadastrado ainda."
      />
    );
  }

  return (
    /*
     * Formulário em duas colunas: à esquerda o que a seção significa, à direita
     * os campos. Explica antes de o operador ter de adivinhar — e dispensa a
     * moldura de card que antes empilhava configuração dentro de caixa.
     */
    <div className="space-y-10">
      <Fieldset
        title="Operação"
        description="Metas e janelas que orientam o ritmo diário da prospecção."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Meta mensal"
            htmlFor="goal"
            hint="Oportunidades qualificadas por mês."
          >
            <Input id="goal" value="40 oportunidades qualificadas" readOnly />
          </Field>
          <Field
            label="Horário de abordagem"
            htmlFor="window"
            hint="Fora dessa janela, as abordagens ficam preparadas."
          >
            <Input id="window" value="08:00–18:00 · segunda a sexta" readOnly />
          </Field>
          <Field
            label="Parâmetros da operação"
            htmlFor="params"
            hint="Limites aplicados a cada lead."
            className="sm:col-span-2"
          >
            <Input
              id="params"
              value="3 tentativas por lead · revisão manual obrigatória"
              readOnly
            />
          </Field>
        </div>
      </Fieldset>

      <Separator />

      <Fieldset
        title="Responsável"
        description="Quem opera a fila e responde pelas decisões."
      >
        <Field label="Operador" htmlFor="operator">
          <Input
            id="operator"
            value={`${operator.display_name} · ${operator.role}`}
            readOnly
          />
        </Field>
      </Fieldset>

      <Separator />

      <Fieldset
        title="Fluxo de trabalho"
        description="A regra que a máquina segue antes de entregar a fila ao operador."
      >
        <Field label="Descrição" htmlFor="workflow">
          <Textarea
            id="workflow"
            readOnly
            rows={4}
            value="A operação prioriza empresas aprovadas, com follow-up até 24h e revisão humana antes do fechamento."
          />
        </Field>
      </Fieldset>
    </div>
  );
}
