import "server-only";
import type { CompaniesRepository } from "@/server/repositories/companies-repository";
import type { MessagesRepository } from "@/server/repositories/messages-repository";
import type { PipelineService } from "@/server/services/pipeline-service";
import type { MessageRow, MessageKind } from "@/types/domain";

// =====================================================================
// Fluxo de mensagem manual (Blueprint RF-11/12, RN-02/03/13/14).
// O sistema NUNCA envia: apenas registra a abertura do deep link e a
// confirmação manual do operador. A confirmação da primeira abordagem
// avança o pipeline (Aprovado -> Primeira abordagem).
// =====================================================================

export function createMessagingService(deps: {
  messages: MessagesRepository;
  companies: CompaniesRepository;
  pipeline: PipelineService;
}) {
  const { messages, companies, pipeline } = deps;

  return {
    /** Registra a abertura do WhatsApp (RN-03). Não envia nada. */
    async open(input: {
      companyId: string;
      templateId: string | null;
      type: MessageKind;
      content: string;
      phoneE164: string | null;
    }): Promise<MessageRow> {
      return messages.createOpened(input);
    },

    /**
     * Confirma o envio manual (RN-03). Se for a primeira abordagem de uma
     * empresa aprovada, avança o pipeline (RF-14).
     */
    async confirmSent(messageId: string): Promise<MessageRow> {
      const message = await messages.confirmSent(messageId);
      const company = await companies.findById(message.company_id);
      if (
        company &&
        message.type === "first_contact" &&
        company.pipeline_stage === "approved"
      ) {
        await pipeline.move({
          companyId: company.id,
          toStage: "first_contact",
          reason: "Primeira mensagem confirmada como enviada",
        });
      }
      return message;
    },

    /** Operador não enviou a mensagem (RN-03). Pipeline não avança. */
    async markNotSent(messageId: string): Promise<MessageRow> {
      return messages.markNotSent(messageId);
    },
  };
}

export type MessagingService = ReturnType<typeof createMessagingService>;
