---
name: status
description: Mostra onde você parou e o que falta fazer.
---

Leia o TASKS.md e conte:

- Tasks completadas: [número] de [total]
- Próxima task: [número] — [nome]
- Tasks restantes: [lista curta]

Leia o git log --oneline -3 e diga:
- Último commit: [mensagem] ([data])

Verifique se o projeto roda (npm run dev) e diga:
- Status: rodando sem erro / com erro [qual]

Apresente tudo em formato limpo e curto. Nada de explicação. Só dados.

"Quer continuar? Digite /construir."
