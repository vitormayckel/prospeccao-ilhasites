# MVP Release Checklist — Ilha Prospect v1.0

Checklist oficial da versão 1.0 antes do deploy.

- Legenda: `[x]` concluído e verificado · `[~]` pronto, aguarda ação manual/deploy · `[ ]` pendente
- Data de referência: 2026-07-16
- Regras de ouro: **nada é enviado automaticamente** · a máquina sugere, o humano decide · confirmação de envio é manual.

---

## 1. Infraestrutura

- [x] **Google Places (New API)** — integração real validada ponta a ponta (coleta → dedup → persistência). Chave restrita configurada.
- [x] **Anthropic** — análise comercial real validada (tool use forçado, `claude-sonnet-5`), schema Zod, sem truncamento.
- [x] **Supabase** — Postgres + Auth, RLS habilitado em todas as tabelas; clients browser/server.
- [x] **Banco** — schema aplicado; 10 empresas reais preservadas; PGlite embutido para validação (mesmo SQL do Supabase).
- [x] **Migrações 0001–0004** — aplicadas no Supabase (init, RLS, triggers, `contact_stage` + `message_kind: greeting`).
- [~] **Migração 0005** (`message_kind: after_conversation`) — criada e validada em PGlite; **aplicar no Supabase antes/durante o deploy** (aditiva, não-destrutiva). Ver seção 4.
- [x] **Variáveis de ambiente** — presentes no `.env.local` (nunca commitadas): `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `BASIC_AUTH_USER/PASSWORD`, `COLLECTION_ALLOW_FIXTURE_FALLBACK=false`.
- [~] **Variáveis no Vercel** — replicar as mesmas chaves no projeto Vercel (produção) antes do deploy.
- [x] **Custos validados** — análise ~US$0,039/empresa (estável); custo/observabilidade de Places e Anthropic registrados em `ai_analyses` e `search_runs`. Ver `docs/INFRASTRUCTURE_VALIDATION.md`.

---

## 2. Funcionalidades

- [x] **Dashboard** — reorganizado em torno da operação: resumo compacto (Para abordar · Aguardando resposta · Responderam · Follow-ups hoje · Atrasados · Revisões) + Fila de Hoje + métricas de 30 dias + atividade de busca.
- [x] **Pipeline** — 6 colunas; cards com score, estágio de contato, próxima ação, prazo/atraso, motivo do follow-up e tempo no estágio (sem virar Trello genérico).
- [x] **Oportunidades** — fila priorizada, revisão humana (aprovar/rejeitar/adiar), detalhe com análise, contatos, histórico, notas e follow-ups.
- [x] **Mensagens** — uma empresa por linha, filtros por estado com contagem (Aguardando envio/resposta, Respondidas, Enviadas, Follow-ups, Falhas, Encerradas), prévia legível e próxima ação.
- [x] **Templates** — 6 categorias com textos de ajuda; CRUD completo (criar/editar/ativar/desativar/excluir); bloqueio de duplicatas; saudação inicial curta e sem conteúdo comercial (validado).
- [x] **Follow-ups** — cadência de lembretes 1 dia útil → 3 dias úteis → 7 dias → encerramento; cancelados quando o lead responde; nunca disparam envio.
- [x] **Fila de Hoje** — checklist diário priorizado e deduplicado, fuso America/Sao_Paulo, com CTAs inline (concluir follow-up, abrir WhatsApp, confirmar envio) sem trocar de página.
- [x] **Deep Link WhatsApp** — abre a conversa com a mensagem preparada (`wa.me`); **não envia**; a confirmação de envio é manual.
- [x] **IA de análise** — score explicado com breakdown, positivos, riscos, oportunidades e argumentos; nunca afirma ausência de site sem confirmação.
- [x] **Sistema de Score** — pesos auditados e **preservados**; score derivado da soma do breakdown; presença digital discrimina corretamente (sem site → score alto; com site → menor). Distinção "site não localizado" vs "confirmado inexistente".
- [~] **Regra central (saudação primeiro)** — máquina de estados com guardas: comercial bloqueado até "Lead respondeu". Validar visualmente no navegador (ver seção 3).

---

## 3. Testes

- [x] **Type-check** — `npm run type-check` limpo.
- [x] **Lint** — `npm run lint` sem avisos ou erros.
- [x] **Build** — `npm run build` OK (12 rotas).
- [x] **Smoke tests (SQL + fluxo)** — PGlite com migrations 0001–0005 + seed: 15 verificações OK (queries da Fila de Hoje/Mensagens/Pipeline + cadência de follow-up).
- [x] **Smoke de rotas** — Supabase real (Basic Auth), somente leitura: `/`, `/opportunities`, `/opportunities/[id]`, `/pipeline`, `/messages`, `/messages/templates`, `/settings/searches` → todos **200**.
- [x] **Fluxo completo (simulado)** — aprovar → saudação preparada → confirmada → aguardando resposta (lembrete 1/3) → concluir lembrete (2/3) → respondeu (cancela lembretes) → comercial preparada → enviada. Baldes/estados coerentes em cada passo.
- [ ] **Teste manual (navegador)** — validar visual/responsividade das telas alteradas; deep link do WhatsApp abrindo no aparelho; tom das sugestões de mensagem.
- [x] **`validate:all`** — db/collection/analysis/messaging/pipeline verdes com as migrations atuais.

---

## 4. Deploy

- [ ] **Migration 0005** — aplicar `0005_message_kind_after_conversation.sql` no Supabase (SQL editor ou tooling de migração). É o único passo de banco; aditivo. O fluxo principal funciona sem ela — apenas a categoria "Follow-up após conversa" depende dela.
- [ ] **Push GitHub** — revisar diff, commitar em branch, abrir PR e mergear (não estamos autorizados a commitar sem aprovação).
- [ ] **Deploy Vercel** — confirmar variáveis de ambiente no projeto; deploy da branch principal.
- [ ] **Teste Produção** — abrir as rotas principais autenticadas; conferir Fila de Hoje, Pipeline e Mensagens com dados reais; validar 1 deep link.

---

## 5. Pós-Deploy

- [ ] **Primeiro lead** — aprovar uma empresa e iniciar o contato (saudação curta).
- [ ] **Primeira análise** — rodar uma análise real e conferir score/breakdown.
- [ ] **Primeiro envio** — abrir o WhatsApp pelo deep link e confirmar o envio manualmente.
- [ ] **Primeiro follow-up** — confirmar que o lembrete 1/3 foi agendado e aparece na Fila de Hoje.
- [ ] **Monitorar logs** — acompanhar erros de coleta/análise (alertas aparecem na Fila de Hoje) e logs do Vercel nas primeiras horas.
- [ ] **Conferir custos** — validar `cost_estimate` das análises e o custo por request do Places após uso real.
- [ ] **Backup inicial** — snapshot/backup do Supabase logo após o primeiro dia de uso real.

---

## Lições Aprendidas

### Principais decisões técnicas do MVP

- **Regra central como máquina de estados explícita.** `contact_stage` é uma coluna dedicada (não derivada de aparência), com transições guardadas em `contact-service`. Isso torna o fluxo "saudação primeiro, comercial depois" auditável e à prova de envio comercial fora de ordem.
- **A máquina sugere, o humano decide.** Nada é enviado automaticamente. O deep link apenas abre a conversa; a confirmação de envio é sempre manual. A saudação é gerada por horário; a mensagem comercial, a partir da análise — nunca afirmando dados não confirmados.
- **Fonte única de verdade.** Dashboard, Pipeline, Mensagens e a página da empresa leem os mesmos campos (`contact_stage`, `pipeline_stage`, follow-ups, mensagens). A "próxima ação" vem de uma única função pura reusada nas quatro telas — sem lógica duplicada.
- **Cadência sem automação de envio.** Lembretes 1/3/7 são apenas isso — lembretes ancorados no envio da saudação, avançados manualmente ao concluir cada um, e cancelados quando o lead responde.
- **Score preservado e explicável.** Os pesos não foram alterados; o score é a soma do breakdown, com distinção entre "site não localizado" e "confirmado inexistente".
- **Migrações aditivas e reversíveis.** Novos estados/categorias entraram por `ALTER TYPE ... ADD VALUE` idempotente, sem tocar dados existentes.
- **Validação sem Docker.** PGlite (Postgres em WASM) roda o mesmo SQL das migrations + seed, permitindo smoke tests determinísticos de schema e fluxo em CI local.

### Arquitetura adotada (para futuras versões)

- **Next.js 14 (App Router), TypeScript strict, Tailwind, Radix/shadcn.** Server Components por padrão; `"use client"` só com hooks/eventos.
- **Camadas no servidor:** `providers` (adapters Places/Anthropic, provider-agnostic) → `repositories` (SQL) → `services` (regras de negócio/máquina de estados) → `actions` (Server Actions com `revalidatePath`). Composition root em `createServerContext()`.
- **Adapters intercambiáveis por contrato** (`PlacesProvider`, `AnalysisProvider`), com fallback de fixtures controlado por env — troca de fornecedor sem tocar a UI.
- **Dois adapters de banco** (postgres.js em produção, PGlite em validação) atrás da mesma interface `Db`.
- **Design system escuro** com tokens em `globals.css`; dourado (#C8A24B) reservado a seleção/foco/ação principal; sem emojis na interface.
- **Segurança:** RLS em todas as tabelas; Basic Auth no middleware para o piloto interno; segredos só em `.env.local`/Vercel, nunca no repositório.

### Próximos passos candidatos (não bloqueiam o deploy)

- Oferecer templates ativos como "quick-pick" dentro do fluxo de abordagem (hoje usa sugestões geradas).
- Podar código legado sem uso (`messaging-service`, `actions/messages`, componentes de dashboard antigos).
- Fuso horário nos cálculos de dias úteis (hoje aproximado em UTC).
