import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Client Supabase para uso em Client Components (browser).
 * Usa apenas chaves públicas (anon). Criado sob demanda para não
 * exigir variáveis de ambiente durante o build.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
