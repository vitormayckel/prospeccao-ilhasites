---
name: prd
description: Gera o PRD completo a partir de uma descrição simples do projeto.
argument-hint: [descreva o projeto em 1-2 frases]
---

O usuário vai descrever o projeto em linguagem simples. Pode ser 1 frase ou 1 parágrafo.

Com base na descrição, gere o PRD.md completo seguindo exatamente a estrutura do template que já existe na raiz do projeto.

Preencha TODOS os campos. Não deixe placeholders. Use seu conhecimento pra inferir funcionalidades, tabelas e regras de negócio coerentes.

Regras:
- Stack é sempre: Next.js 14, TypeScript, Tailwind, Shadcn/ui, Supabase, Framer Motion
- Funcionalidades divididas em alta, média e baixa prioridade
- Banco de dados com tabelas detalhadas (campos, tipos, relacionamentos)
- Seção "O que NÃO faz" com pelo menos 3 limites claros
- Linguagem simples, sem jargão técnico desnecessário

Depois de gerar, pergunte:

"Esse PRD tá alinhado com o que você imaginou? Quer ajustar alguma coisa antes de começar a construir?"

Se o usuário aprovar, atualize o arquivo TASKS.md gerando tasks específicas baseadas nas funcionalidades do PRD. Cada funcionalidade de prioridade alta vira uma task. Depois pergunte:

"PRD e tasks prontos. Digite /construir pra começar."
