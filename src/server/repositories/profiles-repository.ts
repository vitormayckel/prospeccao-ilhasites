import type { Db } from "@/lib/database/sql";
import type { ProfileRow } from "@/types/domain";

export function createProfilesRepository(db: Db) {
  return {
    async list(): Promise<ProfileRow[]> {
      return db.query<ProfileRow>(
        "select * from profiles order by created_at asc",
      );
    },

    async getFirst(): Promise<ProfileRow | null> {
      const rows = await db.query<ProfileRow>(
        "select * from profiles order by created_at asc limit 1",
      );
      return rows[0] ?? null;
    },
  };
}

export type ProfilesRepository = ReturnType<typeof createProfilesRepository>;
