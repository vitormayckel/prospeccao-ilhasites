import type { Db } from "@/lib/database/sql";
import type { MessageTemplateRow, MessageKind } from "@/types/domain";

export function createTemplatesRepository(db: Db) {
  return {
    async list(category?: MessageKind): Promise<MessageTemplateRow[]> {
      if (category) {
        return db.query<MessageTemplateRow>(
          `select * from message_templates
           where deleted_at is null and category = $1
           order by category, name`,
          [category],
        );
      }
      return db.query<MessageTemplateRow>(
        `select * from message_templates
         where deleted_at is null
         order by category, name`,
      );
    },

    async findById(id: string): Promise<MessageTemplateRow | null> {
      const rows = await db.query<MessageTemplateRow>(
        "select * from message_templates where id = $1 and deleted_at is null",
        [id],
      );
      return rows[0] ?? null;
    },

    /** Detecta duplicata na mesma categoria: nome igual (case-insensitive) ou
     *  conteúdo idêntico. Evita biblioteca poluída (§1). */
    async findDuplicate(input: {
      category: MessageKind;
      name: string;
      content: string;
      excludeId?: string;
    }): Promise<MessageTemplateRow | null> {
      const rows = await db.query<MessageTemplateRow>(
        `select * from message_templates
         where deleted_at is null and category = $1
           and ($4::uuid is null or id <> $4)
           and (lower(btrim(name)) = lower(btrim($2)) or btrim(content) = btrim($3))
         limit 1`,
        [input.category, input.name, input.content, input.excludeId ?? null],
      );
      return rows[0] ?? null;
    },

    async create(input: {
      name: string;
      category: MessageKind;
      content: string;
      allowedVariables: string[];
      isDefault: boolean;
      active: boolean;
    }): Promise<MessageTemplateRow> {
      const rows = await db.query<MessageTemplateRow>(
        `insert into message_templates (name, category, content, allowed_variables, is_default, active)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [
          input.name,
          input.category,
          input.content,
          input.allowedVariables,
          input.isDefault,
          input.active,
        ],
      );
      return rows[0]!;
    },

    async update(
      id: string,
      input: {
        name?: string;
        category?: MessageKind;
        content?: string;
        allowedVariables?: string[];
        isDefault?: boolean;
        active?: boolean;
      },
    ): Promise<MessageTemplateRow> {
      const sets: string[] = ["updated_at = now()"];
      const params: unknown[] = [];
      const add = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };
      if (input.name !== undefined) add("name", input.name);
      if (input.category !== undefined) add("category", input.category);
      if (input.content !== undefined) add("content", input.content);
      if (input.allowedVariables !== undefined)
        add("allowed_variables", input.allowedVariables);
      if (input.isDefault !== undefined) add("is_default", input.isDefault);
      if (input.active !== undefined) add("active", input.active);
      params.push(id);
      const rows = await db.query<MessageTemplateRow>(
        `update message_templates set ${sets.join(", ")} where id = $${params.length} returning *`,
        params,
      );
      return rows[0]!;
    },

    async softDelete(id: string): Promise<void> {
      await db.query(
        "update message_templates set deleted_at = now(), updated_at = now() where id = $1",
        [id],
      );
    },
  };
}

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;
