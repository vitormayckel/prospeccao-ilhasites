# CLAUDE.md

## Sobre o projeto
[PREENCHA: Descreva em 2-3 linhas o que o projeto faz, pra quem e qual problema resolve]

## Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Shadcn/ui
- Supabase (banco + auth + storage)
- Framer Motion (animações)
- Lucide React (ícones)

## Estrutura de pastas
- /app — páginas e rotas
- /components — componentes reutilizáveis
- /lib — utilitários e clients (Supabase, helpers)
- /public — assets estáticos

## Regras de código
- Server Components por padrão. "use client" só com hooks ou eventos
- Tipagem completa com TypeScript. Nunca usar "any"
- Imports com @ alias (@/components, @/lib)
- Um componente por arquivo
- Nomes de arquivo em kebab-case
- Nomes de componentes em PascalCase
- Não instalar libs sem perguntar antes
- Não criar arquivos fora da estrutura definida

## Design
- Cor primária: #46347F
- Background: #f4f3f8
- Fontes: Syne (títulos) + DM Sans (corpo)
- Mobile-first, responsivo
- Sem emojis na interface
- Ver src/styles/design-tokens.ts pra tokens completos

## Banco de dados
- Supabase
- Queries via client em /lib/supabase.ts
- RLS habilitado em todas as tabelas

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
