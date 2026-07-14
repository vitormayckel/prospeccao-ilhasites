import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

/**
 * Client Supabase com service role — APENAS no servidor.
 * Ignora RLS por padrão; nunca importar em Client Components.
 * Criado sob demanda para não exigir variáveis durante o build.
 */
export function createSupabaseAdminClient(): AdminClient {
  if (cached) return cached;
  cached = createClient<Database>(
    env.supabaseUrl(),
    env.supabaseServiceRoleKey(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
