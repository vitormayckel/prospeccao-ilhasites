/**
 * Leitura centralizada de variáveis de ambiente.
 * Segredos server-only nunca devem usar o prefixo NEXT_PUBLIC_.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Configure em .env.local (veja .env.example).`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  // Server-only. Nunca expor no cliente.
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
};
