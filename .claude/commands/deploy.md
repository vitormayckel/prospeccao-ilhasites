---
name: deploy
description: Guia passo a passo pra publicar o projeto. Supabase + GitHub + Vercel.
---

Vou te guiar pra colocar o projeto no ar. Um passo por vez.

PASSO 1 — GITHUB
Diga: "Primeiro vamos subir o código pro GitHub."
Rode os comandos:
- git init (se ainda não iniciou)
- Verifique o .gitignore (deve ter node_modules, .env.local, .next)
- git add .
- git commit -m "versão inicial"
Diga: "Agora crie um repositório no GitHub (github.com/new) e me diga o nome que criou."
Espere o usuário responder. Depois rode:
- git remote add origin [URL]
- git push -u origin main
Diga: "Código no GitHub. Próximo passo: banco de dados."

PASSO 2 — SUPABASE
Diga: "Abre o Supabase (supabase.com) e cria um novo projeto."
Espere. Depois diga: "Me diz o nome do projeto que criou."
Gere o SQL de criação das tabelas baseado no PRD.md e diga:
"Cola esse SQL no SQL Editor do Supabase e clica Run:"
[SQL aqui]
Depois diga: "Agora ativa o RLS em cada tabela: vai em Authentication > Policies."
Gere as policies necessárias.
Diga: "Copia a URL e a anon key do Supabase (Settings > API) e cola no seu .env.local."

PASSO 3 — VERCEL
Diga: "Abre vercel.com, faz login com GitHub e clica 'Add New Project'."
"Importa o repositório que acabou de criar."
"Na tela de configuração, adiciona as variáveis de ambiente (as mesmas do .env.local)."
"Clica Deploy."
Espere. Diga: "Quando terminar, me manda a URL que a Vercel gerou."

PASSO 4 — TESTE
Diga: "Abre a URL e testa:"
- "Todas as páginas carregam?"
- "As funcionalidades principais funcionam?"
- "Testa no celular também."
- "Vê se tem erro no console (F12 no Chrome)."

"Se tudo tá funcionando, seu projeto tá no ar. Parabéns."
