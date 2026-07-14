import type { AdminClient } from "@/lib/database/supabase-admin";
import type { FollowUpRow } from "@/types/domain";

export function createFollowUpsRepository(db: AdminClient) {
  return {
    async create(input: {
      companyId: string;
      dueAt: string;
      type?: string;
      notes?: string | null;
      assignedTo?: string | null;
    }): Promise<FollowUpRow> {
      const { data, error } = await db
        .from("follow_ups")
        .insert({
          company_id: input.companyId,
          due_at: input.dueAt,
          type: input.type ?? "follow_up",
          notes: input.notes ?? null,
          assigned_to: input.assignedTo ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async complete(id: string): Promise<FollowUpRow> {
      const { data, error } = await db
        .from("follow_ups")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    /** Pendentes vencendo até `until` (ISO) — dashboard de hoje/atrasados. */
    async listPendingDueBy(until: string): Promise<FollowUpRow[]> {
      const { data, error } = await db
        .from("follow_ups")
        .select("*")
        .eq("status", "pending")
        .is("deleted_at", null)
        .lte("due_at", until)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  };
}

export type FollowUpsRepository = ReturnType<typeof createFollowUpsRepository>;
