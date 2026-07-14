import type { Db } from "@/lib/database/sql";
import type {
  SearchProfileRow,
  SearchProfileLocationRow,
  SearchProfileCategoryRow,
} from "@/types/domain";
import type { SearchProfileInput } from "@/lib/validation/search-profile";

export interface SearchProfileListItem extends SearchProfileRow {
  cities: string[];
  category_count: number;
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
            coalesce(
              array_agg(distinct l.city) filter (where l.city is not null),
              '{}'
            ) as cities,
            (select count(*)::int from search_profile_categories x
               where x.search_profile_id = sp.id and x.active) as category_count
          from search_profiles sp
          left join search_profile_locations l on l.search_profile_id = sp.id
          where sp.deleted_at is null
          group by sp.id
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
          `insert into search_profile_locations (search_profile_id, city, state, country_code)
           values ($1, $2, $3, $4)`,
          [profile.id, loc.city, loc.state, loc.countryCode],
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

    async setStatus(
      id: string,
      status: SearchProfileRow["status"],
    ): Promise<void> {
      await db.query(
        "update search_profiles set status = $1, updated_at = now() where id = $2",
        [status, id],
      );
    },
  };
}

export type SearchProfilesRepository = ReturnType<
  typeof createSearchProfilesRepository
>;
