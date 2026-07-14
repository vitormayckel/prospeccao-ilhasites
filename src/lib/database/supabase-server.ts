import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Client Supabase para uso no servidor (Server Components, Route Handlers,
 * Server Actions). Integra com os cookies da requisição.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        } catch {
          // `setAll` pode ser chamado em Server Component; ignorado quando
          // não há resposta para escrever cookies (tratado por middleware).
        }
      },
    },
  });
}
