# Banco de dados — Ilha Prospect

Camada de dados versionada. O mesmo SQL roda no PGlite (validação local) e no
Supabase (produção).

## Estrutura

- `migrations/0001_init.sql` — schema: enums, tabelas, relacionamentos, índices, constraints.
- `migrations/0002_rls.sql` — RLS habilitado em todas as tabelas (deny-default; acesso via service role).
- `migrations/0003_triggers.sql` — trigger de `updated_at`.
- `seed.sql` — dados realistas (GERADO; não editar à mão).

## Comandos

```bash
# Regenera o seed a partir do dataset (scripts/seed/dataset.mjs)
npm run db:generate-seed

# Valida migrations + seed em um Postgres embutido (PGlite/WASM), sem Docker
npm run db:validate
```

## Aplicar em um projeto Supabase real

1. Crie um projeto em supabase.com e copie URL + chaves para `.env.local`
   (veja `.env.example`).
2. Aplique as migrations, em ordem, via **SQL Editor** do painel ou via CLI:

   ```bash
   # Opção CLI (requer supabase CLI + projeto linkado)
   supabase db push
   ```

   Ou cole o conteúdo de cada arquivo de `migrations/` (na ordem) e depois
   `seed.sql` no SQL Editor.
3. `pg_trgm` já é suportado pelo Supabase; nenhuma configuração extra é necessária.

> Segredos ficam em variáveis de ambiente, nunca no banco (Blueprint §18).
