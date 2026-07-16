# Validação de Infraestrutura e Robustez da IA

> Estado final da infraestrutura do **Ilha Prospect** após as validações reais de
> ponta a ponta (Supabase, Google Places API New e Anthropic).
> Documento de referência permanente. Última atualização: **2026-07-16**.

---

## Infraestrutura

### Stack utilizada

- **Next.js 14** (App Router) — frontend + backend (API Routes / Server Actions).
- **TypeScript** (strict) — tipagem completa, sem `any`.
- **Tailwind CSS** + Radix UI + componentes próprios (padrão shadcn/ui).
- **Supabase** — PostgreSQL 17 gerenciado + Auth + RLS.
- **PostgreSQL** — acesso via `postgres.js` (produção) e PGlite/WASM (validação local).
- **Anthropic Claude** (`claude-sonnet-5`) — camada de análise comercial por IA.
- **Google Places API (New)** — coleta de negócios locais.
- **Vercel** — deploy (destino).
- Lucide React (ícones), Geist Sans/Mono (fontes), Framer Motion (animações pontuais).

### Arquitetura resumida

Aplicação single-tenant (uso interno). Camadas bem separadas:

- `src/app` — páginas e rotas (grupo `(app)` sob o AppShell).
- `src/components` — UI reutilizável e layout (sidebar, topbar, shell).
- `src/features/*` — código por domínio (opportunities, dashboard, messages, ...).
- `src/server` — **composition root** (`context.ts`), services, repositories e
  **providers** (adapters). Todo o domínio é acessado por Server Components e
  Server Actions através de `createServerContext()`.
- `src/lib/database` — camada de dados agnóstica de driver (`Db`), com dois
  adapters: **PGlite** (local) e **postgres.js** (produção via `DATABASE_URL`).
- `supabase/migrations` — schema versionado (mesmo SQL roda local e em produção).

**Princípios de design:**

- **Contratos provider-agnósticos**: `PlacesProvider` e `AnalysisProvider` isolam
  o provedor concreto. O pipeline nunca conhece Google/Anthropic diretamente.
- **A máquina sugere, o humano decide**: a IA gera análise + score explicável;
  o operador aprova; o envio pelo WhatsApp é manual.
- **Server Components por padrão**; `"use client"` só com hooks/eventos.

### Fluxo completo do sistema

```
Perfil de pesquisa (categoria × cidade)
        ↓
Coleta (Google Places New)  ──►  Normalização
        ↓
Deduplicação (4 níveis)
        ↓
Persistência (companies / sources / evidence)
        ↓
Análise IA (Anthropic, tool use forçado)
        ↓
Validação (Zod + invariantes semânticas)
        ↓
Gravação (ai_analyses + atualização de status)
        ↓
Interface (fila de Oportunidades → decisão humana)
```

---

## Serviços configurados

### Supabase

- PostgreSQL 17 gerenciado + Auth + **RLS habilitado em todas as tabelas**
  (deny-default; acesso via service role no servidor).
- Conexão de aplicação via **session pooler** (`DATABASE_URL`, SSL).
- Clients em `src/lib/database/supabase-{browser,server}.ts`.
- Sem `organization_id` / sem multiempresa nesta versão.

### Google Places API (New)

- Provider: `src/server/providers/places/google-places-provider.ts`.
- Endpoint: `https://places.googleapis.com/v1/places:searchText` (**API New**,
  não a legada). Autenticação por header `X-Goog-Api-Key` + `X-Goog-FieldMask`.
- FieldMask solicita: `id`, `displayName`, `primaryTypeDisplayName`,
  telefone (nacional/internacional), `websiteUri`, `formattedAddress`,
  `addressComponents`, `location`, `rating`, `userRatingCount`, `googleMapsUri`.
- Teto de página: 20 resultados (proteção de custo). Timeout: 15 s.

### Anthropic

- Provider: `src/server/providers/analysis/anthropic-provider.ts`.
- **Messages API** com **tool use forçado** (`tool_choice: {type:"tool"}`,
  ferramenta `registrar_analise`) — garante saída estruturada.
- Modelo: `claude-sonnet-5` (fallback no código; configurável por env).
- `max_tokens: 4096`, timeout 30 s, `anthropic-version: 2023-06-01`.
- Prompt e schema da ferramenta isolados em
  `src/server/providers/analysis/prompt.ts` (versionados por `PROMPT_VERSION`).

### Banco PostgreSQL

- Adapter de produção: `src/lib/database/postgres-adapter.ts` (`postgres.js`,
  `prepare: false`, pool `max: 5`).
- Adapter local: `src/lib/database/pglite-adapter.ts` (PGlite/WASM, sem Docker).
- Seleção automática por presença de `DATABASE_URL` (`src/lib/database/index.ts`).
- Extensão `pg_trgm` ativa (busca por similaridade de nomes na dedup).

### Next.js

- App Router; rotas dinâmicas server-rendered.
- **Trava de acesso** (`src/middleware.ts`): HTTP Basic Auth contra
  `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (portão único para uso interno;
  sem credenciais definidas ⇒ sem trava em dev).

---

## Variáveis de ambiente

> Apenas os **nomes**. Valores nunca são versionados nem exibidos; ficam em
> `.env.local` (não commitado) e no painel da Vercel.

- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACES_COST_PER_REQUEST`
- `COLLECTION_ALLOW_FIXTURE_FALLBACK`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANALYSIS_PROVIDER`
- `ANTHROPIC_COST_PER_MTOK_INPUT`
- `ANTHROPIC_COST_PER_MTOK_OUTPUT`

---

## Migrations

Aplicadas ao Supabase real em ordem, cada uma em sua própria transação:

| Arquivo | Finalidade |
|---|---|
| `0001_init.sql` | Schema inicial: `create extension pg_trgm`, **16 enums** (vocabulários controlados), **19 tabelas** (profiles, search_profiles, search_profile_locations, search_profile_categories, search_runs, companies, company_sources, company_field_evidence, ai_analyses, company_decisions, company_notes, message_templates, messages, follow_ups, pipeline_events, audit_events, integration_settings, job_queue, suppression_list), relacionamentos, **índices** (incl. GIN trigram e uniques parciais) e constraints. |
| `0002_rls.sql` | **Row Level Security** habilitado em todas as tabelas (deny-default, sem policies nesta versão; acesso só via service role no servidor). |
| `0003_triggers.sql` | Função `set_updated_at()` + trigger de `updated_at` em 15 tabelas mutáveis. |

**Verificação pós-aplicação (somente leitura):** 19 tabelas, 16 enums, 51 índices,
15 triggers, RLS 19/19, `pg_trgm` ativa, todas as tabelas vazias na criação.

---

## Pipeline

```
Coleta
   ↓
Deduplicação
   ↓
Persistência
   ↓
Análise IA
   ↓
Validação
   ↓
Gravação
   ↓
Interface
```

- **Coleta** — `collection-service.runSearch` itera localidades × categorias do
  perfil, chama o `PlacesProvider` (Google Places New) e normaliza cada resultado
  (nome, telefone E.164, domínio, endereço, etc.). Teto por consulta e limite
  diário protegem custo.
- **Deduplicação** (`collection-repository`, ordem de confiança):
  1. `provider + external_id` (place_id) → mescla;
  2. telefone E.164 → mescla;
  3. domínio normalizado → mescla;
  4. nome similar (pg_trgm, limiar 0.55) na mesma cidade → **novo, mas sinalizado**
     com nota (não mescla em silêncio).
  Empresas em `suppression_list` (LGPD) são puladas.
- **Persistência** — insere/atualiza `companies`, registra proveniência em
  `company_sources` (upsert por provider+external_id) e rastreabilidade campo a
  campo em `company_field_evidence`. Duplicatas exatas só **preenchem campos
  ausentes** (não sobrescrevem).
- **Análise IA** — `analysis-service.analyzeCompany` monta o snapshot (apenas
  dados permitidos), chama o `AnalysisProvider` (Anthropic) e cria o registro em
  `ai_analyses` (status `running`).
- **Validação** — `prospectAnalysisSchema` (Zod) valida a estrutura; em seguida a
  análise é **saneada e reconciliada** e passa por `validateSemantics`
  (invariante `points ≤ max_points`). Até 3 tentativas.
- **Gravação** — em sucesso, `ai_analyses` vira `completed` (com score, potencial,
  confiança, tokens e custo) e a empresa vai para `review_status=pending_review`,
  `pipeline_stage=analyzed`. Em falha após retries, `analysis_failed`
  (reprocessável).
- **Interface** — a fila de **Oportunidades** (`/opportunities`) lista as empresas
  para decisão humana; o detalhe exibe score explicado, positivos/riscos/
  oportunidades e sugestões de abordagem.

---

## Melhorias implementadas

Correções estruturais na robustez da IA (sem alterar prompt, pesos ou critérios):

- **Score derivado do breakdown** — o `score` passa a ser **calculado** como
  `round(Σ points)` (limitado a 0–100) em `sanitizeAnalysis`, e a comparação que
  rejeitava divergências aritméticas foi removida. O score fica sempre coerente e
  recalculável (Blueprint §9.6/5).
- **`max_tokens` 2048 → 4096** — a saída estruturada completa (6 dimensões + 4
  listas com texto/refs + resumo) ficava colada no teto de 2048 e truncava. O teto
  maior elimina o truncamento **sem aumentar custo** (a cobrança é por tokens
  gerados, ~2.000 por análise).
- **Validação de `stop_reason`** — o provider agora detecta
  `stop_reason: "max_tokens"` e lança um erro explícito (registrado no fluxo de
  reprocessamento), em vez de deixar passar um JSON de ferramenta incompleto.
- **Saneamento de `evidence_refs`** — refs citados fora do snapshot são
  **removidos antes** da validação semântica, sem rejeitar a análise inteira.
- **Registro correto de custos** — como o pipeline agora conclui de forma
  confiável, `ai_analyses` grava `tokens_input`, `tokens_output` e `cost_estimate`
  das análises concluídas, e o custo registrado passa a refletir o gasto real
  (antes, tentativas falhas queimavam tokens sem registro).

---

## Resultados finais

Validação real de ponta a ponta (dados reais, sem fixtures/mocks):

| Item | Status |
|---|---|
| Google Places API (New) | ✅ Validado (coleta real, campos corretos, dedup íntegra) |
| Anthropic | ✅ Validada (conectividade + análise estruturada) |
| Supabase | ✅ Validado (migrations aplicadas, RLS, tabelas) |
| Persistência | ✅ Validada (companies / sources / evidence / ai_analyses) |
| Interface local | ✅ Empresas exibidas em `/opportunities` (HTTP 200 c/ Basic Auth) |
| `npm run type-check` | ✅ OK |
| `npm run lint` | ✅ OK (sem warnings) |
| `npm run build` | ✅ OK |

**Números finais (robustez da IA):**

- Sucesso inicial: **20%** (1/5) — falhas por divergência de score, ref alucinado
  e truncamento.
- Sucesso após melhorias: **100%** — amostra nova (5/5) e reprocesso das 4
  anteriores (4/4).
- Custo médio por análise: **~US$ 0,039** (inalterado antes/depois).
- Retries finais: **0** na amostra nova; **1 retry benigno e auto-corrigido** no
  reprocesso (falha estrutural pontual de 1ª tentativa, corrigida na 2ª — não
  relacionada às causas tratadas).
- Divergências de score: **0**. Truncamentos: **0**.

---

## Custos

### Google Places

- Custo estimado **por requisição**, configurável via `GOOGLE_PLACES_COST_PER_REQUEST`
  (padrão US$ 0,032/req, compatível com o SKU Text Search Pro/Enterprise).
- Cada consulta (categoria × cidade) = 1 requisição (até 20 resultados). O custo do
  run é a soma das requisições e fica registrado em `search_runs.estimated_cost`.

### Anthropic

- Custo estimado **por tokens**: `(tokens_input/1M × CUSTO_INPUT) +
  (tokens_output/1M × CUSTO_OUTPUT)`, com as taxas em
  `ANTHROPIC_COST_PER_MTOK_INPUT` / `ANTHROPIC_COST_PER_MTOK_OUTPUT`
  (padrão US$ 3 / US$ 15 por 1M — tarifa do `claude-sonnet-5`).
- Calculado no provider a partir de `usage.input_tokens` / `usage.output_tokens`
  e persistido em `ai_analyses.cost_estimate` (por análise). Uma análise típica
  usa ~2.900 tokens de entrada e ~2.000 de saída (~US$ 0,039).

---

## Decisões de arquitetura

Decisões relevantes tomadas/consolidadas nesta etapa e o porquê:

- **Score recalculável, derivado do breakdown.** Pedir ao modelo o `score` *e* um
  breakdown que somasse exatamente esse valor era a maior fonte de falha (LLMs
  erram aritmética). Derivar o score da soma torna o resultado determinístico e
  fiel ao contrato (score explicável e recalculável), sem depender do acerto do
  modelo.
- **Teto de tokens folgado + verificação de truncamento.** Preferiu-se um teto
  seguro (4096) e a checagem de `stop_reason` a confiar num teto justo — custo é
  por token gerado, então o teto maior não encarece, mas elimina uma classe de
  falha silenciosa.
- **Validação tolerante onde é seguro.** Refs inválidos são saneados em vez de
  derrubar toda a análise; invariantes de negócio que importam (`points ≤
  max_points`) continuam rígidas. Rede de segurança (até 3 tentativas) mantida
  para variação residual do modelo.
- **Contratos provider-agnósticos (`PlacesProvider` / `AnalysisProvider`).**
  Permitem alternar entre integração real e fixture determinístico e trocar de
  provedor sem tocar no pipeline.
- **Gate explícito contra dados fictícios.** `COLLECTION_ALLOW_FIXTURE_FALLBACK`
  deve ser `false` em validação/produção para garantir que a coleta use a API real
  — evita que fixtures se passem por dados reais.
- **Camada de dados com dois adapters (PGlite/postgres.js).** Mesmo SQL roda local
  (sem Docker) e em produção, selecionado por `DATABASE_URL`. Simplifica
  desenvolvimento e mantém paridade de schema.
- **Trava de acesso mínima (Basic Auth no middleware).** Portão único e simples
  para uso interno, sem construir autenticação por usuário nesta fase.
- **Humano no controle.** A IA prepara e sugere; a decisão e o envio permanecem
  manuais — reduz risco operacional e de LGPD.

---

## Pendências

Melhorias futuras (não são bugs; os problemas desta etapa já foram resolvidos):

- **Zerar o retry residual da IA** — reforçar o prompt ou clampar `points` ao
  `max_points` para eliminar a falha estrutural pontual de 1ª tentativa (fora do
  escopo desta etapa, que não alterou prompts/critérios).
- **Structured Outputs / `strict: true`** no schema da ferramenta, para garantir
  campos obrigatórios sem depender de retry.
- **Registro de custo em tentativas que falham** — hoje só análises concluídas
  gravam `cost_estimate`/tokens; falhas (`markFailed`) não registram gasto,
  reduzindo a observabilidade de custo em cenários de erro.
- **Paginação do Google Places** (`nextPageToken`) para coletas maiores que 20
  resultados por consulta.
- **Policies de RLS por operador** quando a autenticação de usuário for adicionada
  (hoje o acesso é só via service role).
- **Verificação real de WhatsApp** (hoje inferido como "provável" a partir de
  número celular).
- **Reprocessamento em lote agendado** das empresas em `analysis_failed`.
