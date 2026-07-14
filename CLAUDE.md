# CLAUDE.md

## Sobre o projeto

Ilha Prospect — Sistema Operacional de Prospecção Comercial interno da Ilha Sites.
Pesquisa negócios locais, organiza/deduplica dados públicos, gera análise por IA com
score explicado e entrega ao operador uma fila priorizada para decisão humana. A máquina
prepara e sugere; o humano decide; o envio pelo WhatsApp permanece manual.

> Fonte de verdade oficial do produto: `Ilha_Prospect_Blueprint_v1.md`.
> Ordem de prioridade em caso de divergência: decisões recentes do usuário > Blueprint > PRD > Escopo > Design System > Memory.

## Stack

- Next.js 14 (App Router)
- TypeScript (strict)
- Tailwind CSS
- Radix UI + componentes próprios (padrão shadcn/ui)
- Supabase (banco + auth)
- Framer Motion (animações — só onde melhora orientação)
- Lucide React (ícones)
- Fontes Geist Sans / Geist Mono

## Estrutura de pastas

- /src/app — páginas e rotas (grupo `(app)` usa o AppShell)
- /src/components/ui — componentes de UI reutilizáveis
- /src/components/layout — shell, sidebar, topbar, navegação
- /src/features/\* — código por domínio (companies, opportunities, dashboard, ...)
- /src/server — actions, jobs, repositories, services, providers (adapters)
- /src/lib — utilitários e clients (Supabase em /src/lib/database)
- /src/types — tipos compartilhados
- /supabase/migrations — migrations versionadas

## Regras de código

- Server Components por padrão. "use client" só com hooks ou eventos
- Tipagem completa com TypeScript. Nunca usar "any"
- Imports com @ alias (@/components, @/lib)
- Um componente por arquivo
- Nomes de arquivo em kebab-case
- Nomes de componentes em PascalCase
- Não instalar libs sem perguntar antes
- Não criar arquivos fora da estrutura definida

## Design (tema escuro — Blueprint §13)

- Referências: Linear, Vercel, Raycast, Arc. Interface limpa, muito espaçamento, visual premium.
- Background: #0E0F12 · Surface: #15171C · Preto: #000000
- Accent (dourado): #C8A24B — só em seleção, foco e ação principal (nunca em grandes superfícies)
- Texto: branco (#F5F5F3) / secundário (#A4A7AE) / muted (#737780)
- Evitar: gradientes, sombras exageradas, bordas pesadas, animações excessivas
- Tokens completos em `src/app/globals.css` (variáveis CSS) e apelidos em `tailwind.config.ts`
- Sem emojis na interface

## Banco de dados

- Supabase (Postgres + Auth), RLS habilitado em todas as tabelas
- Clients em `/src/lib/database/supabase-{browser,server}.ts`
- Sem `organization_id` / sem multiempresa nesta versão (uso interno)

## Deploy

- Vercel
- Variáveis de ambiente no .env.local (nunca commitar)

## O que NÃO fazer

- Não usar FastAPI. Todo backend é Next.js API Routes
- Não fazer auto-compact. Sempre manual
- Não commitar sem aprovação. Mostrar diff antes
- Não implementar sem plano aprovado
- Não criar componentes genéricos que já existem no Shadcn

## Gestão de contexto (IMPORTANTE)

- Fazer /compact manual ao atingir 50% do contexto
- Uma task por sessão. Commitar e iniciar sessão nova pra próxima
- Se perder contexto: ler CLAUDE.md e TASKS.md antes de continuar
- Prompts curtos e diretos. Nada de explicação desnecessária
- Referenciar arquivos por caminho (@/components/Header.tsx) em vez de descrever
- Não pedir pra "listar todos os arquivos" ou "mostrar todo o código". Pedir só o necessário
