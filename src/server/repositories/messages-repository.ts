import type { Db } from "@/lib/database/sql";
import type {
  MessageRow,
  MessageKind,
  MessageStatus,
  ContactStage,
} from "@/types/domain";

export interface MessageWithCompany extends MessageRow {
  company_name: string;
  company_city: string | null;
}

/** Linha do quadro operacional de contato (uma empresa por linha). */
export interface ContactBoardRow {
  company_id: string;
  company_name: string;
  company_city: string | null;
  contact_stage: ContactStage;
  phone_e164: string | null;
  phone_raw: string | null;
  score: number | null;
  updated_at: string;
  last_message_type: MessageKind | null;
  last_message_content: string | null;
  last_message_status: MessageStatus | null;
  last_message_at: string | null;
}

export function createMessagesRepository(db: Db) {
  return {
    /** Histórico de mensagens com a empresa (Blueprint RF-12). */
    async listRecent(limit = 50): Promise<MessageWithCompany[]> {
      return db.query<MessageWithCompany>(
        `select m.*, c.name as company_name, c.city as company_city
         from messages m
         join companies c on c.id = m.company_id
         order by coalesce(m.sent_at, m.created_at) desc
         limit $1`,
        [limit],
      );
    },

    /**
     * Quadro operacional: uma linha por empresa já em contato (ou com histórico
     * de mensagens), com a última mensagem. Alimenta a página de Mensagens
     * agrupada por estado (§2). Fonte única: contact_stage + última mensagem.
     */
    async listContactBoard(): Promise<ContactBoardRow[]> {
      return db.query<ContactBoardRow>(
        `select
           c.id as company_id, c.name as company_name, c.city as company_city,
           c.contact_stage, c.phone_e164, c.phone_raw, c.score, c.updated_at,
           m.type as last_message_type, m.content as last_message_content,
           m.status as last_message_status,
           coalesce(m.sent_at, m.opened_at, m.created_at) as last_message_at
         from companies c
         left join lateral (
           select * from messages mm
           where mm.company_id = c.id
           order by coalesce(mm.sent_at, mm.opened_at, mm.created_at) desc
           limit 1
         ) m on true
         where c.deleted_at is null and (
           c.contact_stage <> 'not_started'
           or exists (select 1 from messages mx where mx.company_id = c.id)
         )
         order by c.updated_at desc`,
      );
    },

    async findById(id: string): Promise<MessageRow | null> {
      const rows = await db.query<MessageRow>(
        "select * from messages where id = $1",
        [id],
      );
      return rows[0] ?? null;
    },

    /**
     * Registra a abertura do WhatsApp (RN-03): status "opened" + opened_at.
     * O conteúdo final é salvo independentemente do template (RN-13).
     */
    async createOpened(input: {
      companyId: string;
      templateId: string | null;
      type: MessageKind;
      content: string;
      phoneE164: string | null;
    }): Promise<MessageRow> {
      const rows = await db.query<MessageRow>(
        `insert into messages
           (company_id, template_id, type, content, phone_e164, status, opened_at)
         values ($1, $2, $3, $4, $5, 'opened', now())
         returning *`,
        [
          input.companyId,
          input.templateId,
          input.type,
          input.content,
          input.phoneE164,
        ],
      );
      return rows[0]!;
    },

    /** Confirmação manual de envio (RN-03/RN-14): status "confirmed_sent". */
    async confirmSent(id: string): Promise<MessageRow> {
      const rows = await db.query<MessageRow>(
        `update messages set status = 'confirmed_sent', sent_at = now(),
           updated_at = now() where id = $1 returning *`,
        [id],
      );
      return rows[0]!;
    },

    async markNotSent(id: string): Promise<MessageRow> {
      const rows = await db.query<MessageRow>(
        `update messages set status = 'not_sent', cancelled_at = now(),
           updated_at = now() where id = $1 returning *`,
        [id],
      );
      return rows[0]!;
    },

    /** Momento em que a saudação foi confirmada como enviada — âncora da
     *  cadência de lembretes de "sem resposta". */
    async firstConfirmedGreetingAt(companyId: string): Promise<string | null> {
      const rows = await db.query<{ at: string | null }>(
        `select min(coalesce(sent_at, created_at)) as at from messages
         where company_id = $1 and type = 'greeting' and status = 'confirmed_sent'`,
        [companyId],
      );
      return rows[0]?.at ?? null;
    },

    async listByCompany(companyId: string): Promise<MessageRow[]> {
      return db.query<MessageRow>(
        "select * from messages where company_id = $1 order by created_at desc",
        [companyId],
      );
    },
  };
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>;
