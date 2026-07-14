import type { AdminClient } from "@/lib/database/supabase-admin";
import type { CompanyNoteRow } from "@/types/domain";

export function createNotesRepository(db: AdminClient) {
  return {
    async create(input: {
      companyId: string;
      content: string;
      profileId?: string | null;
    }): Promise<CompanyNoteRow> {
      const { data, error } = await db
        .from("company_notes")
        .insert({
          company_id: input.companyId,
          content: input.content,
          profile_id: input.profileId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async softDelete(id: string): Promise<void> {
      const { error } = await db
        .from("company_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
  };
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;
