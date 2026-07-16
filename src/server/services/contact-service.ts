import "server-only";
import type { CompaniesRepository } from "@/server/repositories/companies-repository";
import type { MessagesRepository } from "@/server/repositories/messages-repository";
import type { FollowUpsRepository } from "@/server/repositories/follow-ups-repository";
import type { PipelineService } from "@/server/services/pipeline-service";
import type {
  CompanyRow,
  ContactStage,
  FollowUpRow,
  MessageRow,
} from "@/types/domain";
import { canStartContact } from "@/lib/contact-flow";

// =====================================================================
// Fluxo de contato (regra central §1): saudação primeiro, comercial depois.
// O sistema NUNCA envia — apenas registra estado, lembretes e a abertura
// manual do deep link. Transições com guardas explícitas por estado.
// =====================================================================

/** Tipo de follow-up gerado para lembrar "saudação sem resposta". */
const NO_REPLY_TYPE = "greeting_no_reply";

/**
 * Cadência de lembretes de "sem resposta" (§5). Nada é enviado — cada passo é
 * apenas um lembrete para o operador retomar. Ancorada no envio da saudação:
 * 1 dia útil → 3 dias úteis → 7 dias. Depois, encerramento manual.
 */
const NO_REPLY_CADENCE: ReadonlyArray<{
  businessDays?: number;
  calendarDays?: number;
}> = [{ businessDays: 1 }, { businessDays: 3 }, { calendarDays: 7 }];

/** Soma dias úteis (seg–sex) a uma data. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
}

/** Vencimento do passo `stepIndex` da cadência, a partir da âncora. Null quando
 *  a cadência acabou (não há mais lembrete automático). */
function nextNoReplyDue(anchor: Date, stepIndex: number): Date | null {
  const step = NO_REPLY_CADENCE[stepIndex];
  if (!step) return null;
  if (step.businessDays != null) return addBusinessDays(anchor, step.businessDays);
  return new Date(anchor.getTime() + (step.calendarDays ?? 0) * 86400000);
}

export function createContactService(deps: {
  companies: CompaniesRepository;
  messages: MessagesRepository;
  followUps: FollowUpsRepository;
  pipeline: PipelineService;
}) {
  const { companies, messages, followUps, pipeline } = deps;

  async function requireCompany(id: string): Promise<CompanyRow> {
    const company = await companies.findById(id);
    if (!company) throw new Error("Empresa não encontrada.");
    return company;
  }

  function assertStage(
    company: CompanyRow,
    allowed: ContactStage[],
    action: string,
  ): void {
    if (!allowed.includes(company.contact_stage)) {
      throw new Error(
        `Ação "${action}" indisponível no estado atual do contato.`,
      );
    }
  }

  /** Agenda o próximo lembrete da cadência de "sem resposta", se houver. */
  async function scheduleNoReplyStep(
    companyId: string,
    anchor: Date,
    stepIndex: number,
  ): Promise<void> {
    const due = nextNoReplyDue(anchor, stepIndex);
    if (!due) return;
    await followUps.create({
      companyId,
      dueAt: due.toISOString(),
      type: NO_REPLY_TYPE,
      notes: `Lembrete ${stepIndex + 1}/${NO_REPLY_CADENCE.length} — saudação sem resposta.`,
    });
  }

  return {
    /** Passo 2–3: registra a abertura do WhatsApp com APENAS a saudação. */
    async openGreeting(input: {
      companyId: string;
      content: string;
      phoneE164: string | null;
    }): Promise<MessageRow> {
      const company = await requireCompany(input.companyId);
      if (!canStartContact(company)) {
        throw new Error("Aprove a empresa antes de iniciar o contato.");
      }
      assertStage(
        company,
        ["not_started", "greeting_prepared"],
        "preparar saudação",
      );
      const message = await messages.createOpened({
        companyId: input.companyId,
        templateId: null,
        type: "greeting",
        content: input.content,
        phoneE164: input.phoneE164,
      });
      await companies.setContactStage(input.companyId, "greeting_prepared");
      return message;
    },

    /** Passo 4–5: operador confirma que enviou a saudação → aguardando resposta.
     *  Avança o pipeline e agenda o 1º lembrete de "sem resposta" (§5A). */
    async confirmGreetingSent(messageId: string): Promise<CompanyRow> {
      const message = await messages.confirmSent(messageId);
      const company = await requireCompany(message.company_id);
      if (company.pipeline_stage === "approved") {
        await pipeline.move({
          companyId: company.id,
          toStage: "first_contact",
          reason: "Saudação inicial confirmada como enviada",
        });
      }
      // 1º lembrete da cadência (nada é enviado automaticamente).
      await scheduleNoReplyStep(company.id, new Date(), 0);
      return companies.setContactStage(company.id, "awaiting_reply");
    },

    /** Passo 6: operador confirma manualmente que o lead respondeu.
     *  Cancela os lembretes de "sem resposta" e libera o comercial (§5B). */
    async markReplied(companyId: string): Promise<CompanyRow> {
      const company = await requireCompany(companyId);
      assertStage(
        company,
        ["greeting_prepared", "awaiting_reply"],
        "marcar que respondeu",
      );
      await followUps.cancelPendingByCompany(companyId, NO_REPLY_TYPE);
      return companies.setContactStage(companyId, "replied");
    },

    /** Passo 7–8: registra a abertura do WhatsApp com a mensagem comercial. */
    async openCommercial(input: {
      companyId: string;
      content: string;
      phoneE164: string | null;
    }): Promise<MessageRow> {
      const company = await requireCompany(input.companyId);
      assertStage(
        company,
        ["replied", "commercial_prepared"],
        "preparar mensagem comercial",
      );
      const message = await messages.createOpened({
        companyId: input.companyId,
        templateId: null,
        type: "first_contact",
        content: input.content,
        phoneE164: input.phoneE164,
      });
      await companies.setContactStage(input.companyId, "commercial_prepared");
      return message;
    },

    /** Operador confirma o envio da mensagem comercial. */
    async confirmCommercialSent(messageId: string): Promise<CompanyRow> {
      const message = await messages.confirmSent(messageId);
      return companies.setContactStage(message.company_id, "commercial_sent");
    },

    /** Conclui um follow-up. Se era um lembrete de "sem resposta" e o lead
     *  ainda não respondeu, agenda o próximo passo da cadência (1→3→7). */
    async completeFollowUp(followUpId: string): Promise<FollowUpRow> {
      const followUp = await followUps.findById(followUpId);
      if (!followUp) throw new Error("Follow-up não encontrado.");
      const completed = await followUps.complete(followUpId);
      if (followUp.type === NO_REPLY_TYPE) {
        const company = await requireCompany(followUp.company_id);
        if (company.contact_stage === "awaiting_reply") {
          const count = await followUps.countByType(company.id, NO_REPLY_TYPE);
          const anchorIso = await messages.firstConfirmedGreetingAt(company.id);
          const anchor = anchorIso ? new Date(anchorIso) : new Date();
          await scheduleNoReplyStep(company.id, anchor, count);
        }
      }
      return completed;
    },

    /** §5C: agenda um follow-up manual e marca o estado. Não envia nada. */
    async scheduleFollowUp(input: {
      companyId: string;
      dueAt: string;
      notes?: string | null;
    }): Promise<CompanyRow> {
      await requireCompany(input.companyId);
      await followUps.create({
        companyId: input.companyId,
        dueAt: input.dueAt,
        type: "follow_up",
        notes: input.notes ?? null,
      });
      return companies.setContactStage(
        input.companyId,
        "follow_up_scheduled",
      );
    },

    /** Encerra o contato. Cancela lembretes pendentes; pipeline permanece
     *  sob controle do operador (decisão comercial fica no pipeline). */
    async close(companyId: string): Promise<CompanyRow> {
      await requireCompany(companyId);
      await followUps.cancelPendingByCompany(companyId);
      return companies.setContactStage(companyId, "closed");
    },
  };
}

export type ContactService = ReturnType<typeof createContactService>;
