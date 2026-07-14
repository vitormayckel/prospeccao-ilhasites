import type { Db } from "@/lib/database/sql";
import type { IntegrationSettingRow } from "@/types/domain";

export function createIntegrationsRepository(db: Db) {
  return {
    async list(): Promise<IntegrationSettingRow[]> {
      return db.query<IntegrationSettingRow>(
        "select * from integration_settings order by provider",
      );
    },
  };
}

export type IntegrationsRepository = ReturnType<
  typeof createIntegrationsRepository
>;
