import type { Db } from "@/lib/database/sql";
import type { CompanyNoteRow } from "@/types/domain";

export function createNotesRepository(db: Db) {
  return {
    async create(input: {
      companyId: string;
      content: string;
      profileId?: string | null;
    }): Promise<CompanyNoteRow> {
      const rows = await db.query<CompanyNoteRow>(
        `insert into company_notes (company_id, content, profile_id)
         values ($1, $2, $3) returning *`,
        [input.companyId, input.content, input.profileId ?? null],
      );
      return rows[0]!;
    },

    async softDelete(id: string): Promise<void> {
      await db.query(
        "update company_notes set deleted_at = now(), updated_at = now() where id = $1",
        [id],
      );
    },
  };
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;
