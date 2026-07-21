import type { Db } from "@/lib/database/sql";
import type {
  SearchProfileRow,
  SearchProfileLocationRow,
  SearchProfileCategoryRow,
} from "@/types/domain";
import type {
  SearchProfileInput,
  UpdateSearchProfileInput,
} from "@/lib/validation/search-profile";

export interface ProfileLocationSummary {
  city: string;
  state: string;
  stateName: string | null;
  ibgeCode: number | null;
}

export interface SearchProfileListItem extends SearchProfileRow {
  /** Rótulos "Cidade — UF" para exibição. */
  cities: string[];
  /** Localidades estruturadas, para o seletor de municípios. */
  locations: ProfileLocationSummary[];
  categories: string[];
  category_count: number;
  /** Resumo da execução mais recente (Sprint 2), null se nunca coletou. */
  last_run_finished_at: string | null;
  last_run_status: string | null;
  last_run_results_seen: number | null;
  last_run_new_companies: number | null;
  last_run_duplicates: number | null;
  last_run_failed_items: number | null;
}

export interface SearchProfileDetail {
  profile: SearchProfileRow;
  locations: SearchProfileLocationRow[];
  categories: SearchProfileCategoryRow[];
}

export function createSearchProfilesRepository(db: Db) {
  return {
    async list(): Promise<SearchProfileListItem[]> {
      return db.query<SearchProfileListItem>(
        `select sp.*,
            -- Rótulo com UF: "Betim — MG". A cidade nunca aparece sozinha,
            -- para que um erro de estado seja visível de imediato.
            coalesce(
              array_agg(distinct l.city || ' — ' || l.state)
                filter (where l.city is not null),
              '{}'
            ) as cities,
            -- Forma estruturada, usada pelo seletor ao editar o perfil.
            coalesce(
              (select json_agg(json_build_object(
                        'city', x.city, 'state', x.state,
                        'stateName', x.state_name, 'ibgeCode', x.ibge_code)
                      order by x.city)
                 from search_profile_locations x
                where x.search_profile_id = sp.id),
              '[]'::json
            ) as locations,
            coalesce(
              (select array_agg(c.label order by c.label)
                 from search_profile_categories c
                 where c.search_profile_id = sp.id and c.active),
              '{}'
            ) as categories,
            (select count(*)::int from search_profile_categories x
               where x.search_profile_id = sp.id and x.active) as category_count,
            r.finished_at as last_run_finished_at,
            r.status as last_run_status,
            r.results_seen as last_run_results_seen,
            r.new_companies as last_run_new_companies,
            r.duplicates as last_run_duplicates,
            r.failed_items as last_run_failed_items
          from search_profiles sp
          left join search_profile_locations l on l.search_profile_id = sp.id
          left join lateral (
            select finished_at, status, results_seen, new_companies,
                   duplicates, failed_items
              from search_runs
              where search_profile_id = sp.id
                and status in ('completed', 'partial')
              order by created_at desc
              limit 1
          ) r on true
          where sp.deleted_at is null
          group by sp.id, r.finished_at, r.status, r.results_seen,
                   r.new_companies, r.duplicates, r.failed_items
          order by sp.created_at desc`,
      );
    },

    async getDetail(id: string): Promise<SearchProfileDetail | null> {
      const profiles = await db.query<SearchProfileRow>(
        "select * from search_profiles where id = $1 and deleted_at is null",
        [id],
      );
      const profile = profiles[0];
      if (!profile) return null;

      const [locations, categories] = await Promise.all([
        db.query<SearchProfileLocationRow>(
          "select * from search_profile_locations where search_profile_id = $1",
          [id],
        ),
        db.query<SearchProfileCategoryRow>(
          "select * from search_profile_categories where search_profile_id = $1",
          [id],
        ),
      ]);
      return { profile, locations, categories };
    },

    async create(input: SearchProfileInput): Promise<SearchProfileRow> {
      const created = await db.query<SearchProfileRow>(
        `insert into search_profiles
           (name, status, weekdays, run_time, timezone, daily_limit, radius_meters, min_rating)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [
          input.name,
          input.status,
          input.weekdays,
          input.runTime,
          input.timezone,
          input.dailyLimit,
          input.radiusMeters ?? null,
          input.minRating ?? null,
        ],
      );
      const profile = created[0]!;

      for (const loc of input.locations) {
        await db.query(
          `insert into search_profile_locations
             (search_profile_id, city, state, country_code, ibge_code, state_name)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            profile.id,
            loc.city,
            loc.state,
            loc.countryCode,
            loc.ibgeCode ?? null,
            loc.stateName ?? null,
          ],
        );
      }
      for (const cat of input.categories) {
        await db.query(
          `insert into search_profile_categories (search_profile_id, label, provider_category)
           values ($1, $2, $3)`,
          [profile.id, cat.label, cat.providerCategory ?? null],
        );
      }
      return profile;
    },

    /**
     * Edita um perfil (RF-03). Campos escalares são atualizados quando
     * presentes; localidades e categorias, quando enviadas, substituem as
     * atuais por completo (o dialog sempre manda a lista final).
     */
    async update(input: UpdateSearchProfileInput): Promise<void> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (col: string, value: unknown) => {
        values.push(value);
        sets.push(`${col} = $${values.length}`);
      };
      if (input.name !== undefined) push("name", input.name);
      if (input.status !== undefined) push("status", input.status);
      if (input.weekdays !== undefined) push("weekdays", input.weekdays);
      if (input.runTime !== undefined) push("run_time", input.runTime);
      if (input.timezone !== undefined) push("timezone", input.timezone);
      if (input.dailyLimit !== undefined) push("daily_limit", input.dailyLimit);
      if (input.radiusMeters !== undefined)
        push("radius_meters", input.radiusMeters);
      if (input.minRating !== undefined) push("min_rating", input.minRating);

      if (sets.length > 0) {
        values.push(input.id);
        await db.query(
          `update search_profiles set ${sets.join(", ")}, updated_at = now()
           where id = $${values.length} and deleted_at is null`,
          values,
        );
      }

      if (input.locations !== undefined) {
        await db.query(
          "delete from search_profile_locations where search_profile_id = $1",
          [input.id],
        );
        for (const loc of input.locations) {
          await db.query(
            `insert into search_profile_locations
               (search_profile_id, city, state, country_code, ibge_code, state_name)
             values ($1, $2, $3, $4, $5, $6)`,
            [
              input.id,
              loc.city,
              loc.state,
              loc.countryCode,
              loc.ibgeCode ?? null,
              loc.stateName ?? null,
            ],
          );
        }
      }

      if (input.categories !== undefined) {
        await db.query(
          "delete from search_profile_categories where search_profile_id = $1",
          [input.id],
        );
        for (const cat of input.categories) {
          await db.query(
            `insert into search_profile_categories (search_profile_id, label, provider_category)
             values ($1, $2, $3)`,
            [input.id, cat.label, cat.providerCategory ?? null],
          );
        }
      }
    },

    /** Duplica um perfil com suas localidades e categorias ("Cópia de …"). */
    async duplicate(id: string): Promise<SearchProfileRow | null> {
      const detail = await this.getDetail(id);
      if (!detail) return null;
      const { profile, locations, categories } = detail;
      return this.create({
        name: `Cópia de ${profile.name}`.slice(0, 160),
        status: "paused",
        weekdays: profile.weekdays,
        runTime: profile.run_time,
        timezone: profile.timezone,
        dailyLimit: profile.daily_limit,
        radiusMeters: profile.radius_meters ?? undefined,
        minRating: profile.min_rating ?? undefined,
        locations: locations.map((l) => ({
          city: l.city,
          state: l.state,
          countryCode: l.country_code,
        })),
        categories: categories.map((c) => ({
          label: c.label,
          providerCategory: c.provider_category ?? undefined,
        })),
      });
    },

    /** Remoção lógica (mantém histórico de execuções e proveniência). */
    async softDelete(id: string): Promise<void> {
      await db.query(
        "update search_profiles set deleted_at = now(), updated_at = now() where id = $1",
        [id],
      );
    },

    async setStatus(
      id: string,
      status: SearchProfileRow["status"],
    ): Promise<void> {
      await db.query(
        "update search_profiles set status = $1, updated_at = now() where id = $2",
        [status, id],
      );
    },

    /** Marca a última execução do perfil (RF-03). */
    async markRan(id: string): Promise<void> {
      await db.query(
        "update search_profiles set last_run_at = now(), updated_at = now() where id = $1",
        [id],
      );
    },
  };
}

export type SearchProfilesRepository = ReturnType<
  typeof createSearchProfilesRepository
>;
