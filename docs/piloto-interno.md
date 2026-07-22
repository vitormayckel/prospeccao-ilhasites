# Ilha Prospect — Guia de operação e piloto interno

Sistema operacional de prospecção comercial da Ilha Sites. A máquina pesquisa,
organiza, deduplica e sugere com IA; **o humano decide e envia**. O WhatsApp
apenas **abre** — nunca envia automaticamente.

## Princípio inegociável

- Nenhum endpoint, job ou botão envia mensagem sozinho (RN-02).
- Abrir o WhatsApp registra `opened_at`; só a confirmação manual registra
  `sent_at` e avança o pipeline (RN-03).
- Toda decisão é humana e auditável.

## Pré-requisitos

- Node.js 20+
- Banco Postgres (produção) **ou** nada (dev usa PGlite embutido em `.pglite/`).

## Configuração (`.env.local`)

Copie `.env.example` para `.env.local` e preencha conforme o uso:

| Variável | Função |
|---|---|
| `DATABASE_URL` | Postgres de produção (postgres.js). Ausente → PGlite local. |
| `GOOGLE_PLACES_API_KEY` | Habilita a coleta real (Places API New). Ausente → provider `fixture`. |
| `GOOGLE_PLACES_COST_PER_REQUEST` | Custo estimado por requisição (US$). |
| `COLLECTION_ALLOW_FIXTURE_FALLBACK` | Dev: roda perfis `google_places` no fixture sem custo. |
| `ANTHROPIC_API_KEY` | Habilita a análise real (Claude). Ausente → análise `fixture`. |
| `ANTHROPIC_MODEL` | Modelo (default `claude-sonnet-5`; alternativa barata `claude-haiku-4-5-20251001`). |
| `ANALYSIS_PROVIDER` | Força o provedor de IA (`anthropic`\|`fixture`). |
| `ANTHROPIC_COST_PER_MTOK_INPUT` / `_OUTPUT` | Estimativa de custo por 1M tokens. |

Sem nenhuma chave paga, o sistema roda 100% com os provedores `fixture`
(determinísticos, sem custo) — ideal para demonstração.

## Rodar em desenvolvimento

```bash
npm install
npm run dev     # http://localhost:3000 (PGlite migra + faz seed sozinho)
```

## Qualidade e validação

```bash
npm run type-check     # TypeScript estrito
npm run lint           # ESLint
npm run build          # build de produção
npm run validate:all   # 5 suítes contra Postgres real (PGlite):
                       # schema, coleta/dedup, IA, mensagem, pipeline
```

## Fluxo de operação diária

1. **Buscas** (`/settings/searches`): criar perfil (cidades, categorias,
   limite diário) e "Executar agora" para coletar (dedup automática).
2. **Oportunidades** (`/opportunities`): "Analisar pendentes" roda a IA;
   revisar o score explicado, aprovar/rejeitar/adiar/priorizar.
3. **Abordagem** (detalhe da empresa): "Preparar mensagem" → escolher
   template, revisar texto, **Abrir WhatsApp** → confirmar "enviada".
4. **Pipeline** (`/pipeline`): acompanhar do 1º contato ao fechamento;
   reabrir cliente/perdido exige motivo.
5. **Follow-ups**: agendar e concluir; vencidos/hoje aparecem no dashboard.
6. **Dashboard** (`/`): prioridades do dia, buscas com falha, conversão.

## Deploy (Vercel)

1. Provisione um Postgres (Supabase, Neon, etc.) e defina `DATABASE_URL`.
2. Aplique as migrations de `supabase/migrations/` (e, se quiser dados de
   exemplo, `supabase/seed.sql`).
3. Configure as variáveis de ambiente na Vercel.
4. Deploy.

## Segurança

- Trava de acesso via Basic Auth no `middleware.ts`.
- Cabeçalhos de segurança em `next.config.mjs` (X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- RLS habilitado no schema (deny-default); segredos só em `.env.local`.
- `suppression_list` (LGPD) bloqueia telefones/domínios na coleta.
