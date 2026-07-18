import type { Db } from "@/lib/database/sql";
import type { AuditEventRow } from "@/types/domain";

/**
 * Trilha de eventos genérica (tabela audit_events já existente no schema).
 * Usada para registrar mudanças de campo operacional que alimentam o Timeline
 * da oportunidade (Sprint 4) — sem tabela nova.
 */
export function createAuditRepository(db: Db) {
  return {
    async log(input: {
      entityType: string;
      entityId: string | null;
      action: string;
      actorId?: string | null;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      await db.query(
        `insert into audit_events (actor_id, entity_type, entity_id, action, metadata)
         values ($1, $2, $3, $4, $5)`,
        [
          input.actorId ?? null,
          input.entityType,
          input.entityId,
          input.action,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },

    async listByEntity(
      entityType: string,
      entityId: string,
    ): Promise<AuditEventRow[]> {
      return db.query<AuditEventRow>(
        `select * from audit_events
         where entity_type = $1 and entity_id = $2
         order by created_at desc`,
        [entityType, entityId],
      );
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
