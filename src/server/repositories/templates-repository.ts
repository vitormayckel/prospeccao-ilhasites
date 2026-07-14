import type { AdminClient } from "@/lib/database/supabase-admin";
import type { MessageTemplateRow, MessageKind } from "@/types/domain";

export function createTemplatesRepository(db: AdminClient) {
  return {
    async list(category?: MessageKind): Promise<MessageTemplateRow[]> {
      let query = db
        .from("message_templates")
        .select("*")
        .is("deleted_at", null)
        .eq("active", true)
        .order("category", { ascending: true });
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async findById(id: string): Promise<MessageTemplateRow | null> {
      const { data, error } = await db
        .from("message_templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async create(input: {
      name: string;
      category: MessageKind;
      content: string;
      allowedVariables: string[];
      isDefault: boolean;
      active: boolean;
    }): Promise<MessageTemplateRow> {
      const { data, error } = await db
        .from("message_templates")
        .insert({
          name: input.name,
          category: input.category,
          content: input.content,
          allowed_variables: input.allowedVariables,
          is_default: input.isDefault,
          active: input.active,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async softDelete(id: string): Promise<void> {
      const { error } = await db
        .from("message_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
  };
}

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;
