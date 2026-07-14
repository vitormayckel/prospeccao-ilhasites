---
name: retomar
description: Retoma o trabalho depois de compact ou sessão nova.
---

O contexto foi limpo (compact ou sessão nova). Preciso retomar de onde parei.

1. Leia o CLAUDE.md (regras do projeto)
2. Leia o TASKS.md (veja quais tasks já foram completadas [x] e qual é a próxima)
3. Leia os últimos commits (git log --oneline -5) pra entender o que foi feito recentemente
4. Diga:

"Retomando. Último commit: [mensagem]. Próxima task: Task [número] — [nome]. Quer que eu continue?"

Não releia todos os arquivos. Só CLAUDE.md, TASKS.md e git log. Economize contexto.
