import type { Db } from "@/lib/database/sql";
import type { MessageRow } from "@/types/domain";

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
  };
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>;
