import type { Db } from "@/lib/database/sql";
import type { MessageRow, MessageKind } from "@/types/domain";

export interface MessageWithCompany extends MessageRow {
  company_name: string;
  company_city: string | null;
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

    async listByCompany(companyId: string): Promise<MessageRow[]> {
      return db.query<MessageRow>(
        "select * from messages where company_id = $1 order by created_at desc",
        [companyId],
      );
    },
  };
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>;
