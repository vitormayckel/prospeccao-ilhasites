import type { AdminClient } from "@/lib/database/supabase-admin";
import type {
  SearchProfileRow,
  SearchProfileLocationRow,
  SearchProfileCategoryRow,
} from "@/types/domain";
import type { SearchProfileInput } from "@/lib/validation/search-profile";

export interface SearchProfileDetail {
  profile: SearchProfileRow;
  locations: SearchProfileLocationRow[];
  categories: SearchProfileCategoryRow[];
}

export function createSearchProfilesRepository(db: AdminClient) {
  return {
    async list(): Promise<SearchProfileRow[]> {
      const { data, error } = await db
        .from("search_profiles")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async getDetail(id: string): Promise<SearchProfileDetail | null> {
      const { data: profile, error } = await db
        .from("search_profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const [locations, categories] = await Promise.all([
        db
          .from("search_profile_locations")
          .select("*")
          .eq("search_profile_id", id),
        db
          .from("search_profile_categories")
          .select("*")
          .eq("search_profile_id", id),
      ]);
      return {
        profile,
        locations: locations.data ?? [],
        categories: categories.data ?? [],
      };
    },

    /** Cria perfil com localizações e categorias (transação lógica). */
    async create(input: SearchProfileInput): Promise<SearchProfileRow> {
      const { data: profile, error } = await db
        .from("search_profiles")
        .insert({
          name: input.name,
          status: input.status,
          weekdays: input.weekdays,
          run_time: input.runTime,
          timezone: input.timezone,
          daily_limit: input.dailyLimit,
          radius_meters: input.radiusMeters ?? null,
          min_rating: input.minRating ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (input.locations.length) {
        const { error: locErr } = await db
          .from("search_profile_locations")
          .insert(
            input.locations.map((l) => ({
              search_profile_id: profile.id,
              city: l.city,
              state: l.state,
              country_code: l.countryCode,
            })),
          );
        if (locErr) throw locErr;
      }
      if (input.categories.length) {
        const { error: catErr } = await db
          .from("search_profile_categories")
          .insert(
            input.categories.map((c) => ({
              search_profile_id: profile.id,
              label: c.label,
              provider_category: c.providerCategory ?? null,
            })),
          );
        if (catErr) throw catErr;
      }
      return profile;
    },
  };
}

export type SearchProfilesRepository = ReturnType<
  typeof createSearchProfilesRepository
>;
