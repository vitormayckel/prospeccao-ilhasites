---
name: construir
description: Constrói o projeto task por task, pedindo aprovação a cada passo.
---

Leia o CLAUDE.md, PRD.md e TASKS.md.

Identifique qual é a próxima task não completada (item sem [x]).

Antes de implementar, diga:

"Vou trabalhar na Task [número]: [nome]"
"O que vou fazer:"
- [liste as subtasks em linguagem simples]

"Posso começar?"

Espere o usuário aprovar.

Depois de implementar cada subtask:
1. Diga o que foi feito em 1 linha
2. Se criou algo visual, diga: "Abre o navegador em localhost:3000/[rota] pra ver"

Depois de completar TODAS as subtasks da task:
1. Marque os itens como [x] no TASKS.md
2. Faça commit com mensagem descritiva
3. Diga: "Task [número] concluída. Testou no navegador? Se tá tudo certo, digite /construir pra próxima task."

REGRAS DE ECONOMIA DE TOKENS:
- Não releia o projeto inteiro a cada task. Leia só os arquivos que vai modificar.
- Não liste todos os arquivos. Vá direto ao que importa.
- Respostas curtas. Nada de explicação teórica. Ação direta.
- Se o contexto passar de 50%, avise: "Contexto ficando cheio. Vou fazer /compact. Depois digite /retomar pra continuarmos."
- Commite a cada task, não a cada arquivo.
- Não repita código que já mostrou. Referencie por caminho.
