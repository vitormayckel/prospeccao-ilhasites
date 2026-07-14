---
name: iniciar
description: Primeiro comando ao abrir o Claude Code. Exibe banner e apresenta o plano.
---

Antes de qualquer coisa, exiba essa arte no terminal exatamente como está:

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ┌─┐┬  ┌─┐┬ ┬┌┬┐┌─┐  ┌─┐┬─┐┌─┐                        ║
║     │  │  ├─┤│ │ ││├┤   ├─┘├┬┘│ │                        ║
║     └─┘┴─┘┴ ┴└─┘─┴┘└─┘  ┴  ┴└─└─┘                        ║
║                                                              ║
║     { Framework de desenvolvimento guiado com Claude Code }  ║
║                                                              ║
║     por Ana Paula Perci                                      ║
║     NexIA Lab · PERCI Educação e Tecnologia                  ║
║                                                              ║
║     Comandos disponíveis:                                    ║
║     /iniciar .... Começar o projeto                          ║
║     /ideia ...... Descobrir o que construir                   ║
║     /prd ........ Gerar PRD do projeto                       ║
║     /construir .. Construir task por task                     ║
║     /deploy ..... Publicar na internet                       ║
║     /agente ..... Criar agente de IA                         ║
║     /status ..... Ver onde parou                             ║
║     /corrigir ... Resolver um bug                            ║
║     /revisar .... Revisar antes de entregar                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Depois de exibir o banner, leia o CLAUDE.md e o TASKS.md na raiz do projeto.

Se o PRD.md ainda estiver com placeholders (texto entre colchetes []), diga:

"Seu PRD ainda não está preenchido. Antes de construir, precisamos definir o que vamos criar. Digite /ideia se ainda não sabe o que construir, ou /prd se já tem uma ideia e quer gerar o PRD."

Se o PRD.md já estiver preenchido, analise a estrutura completa do projeto e apresente:

1. Resumo do que entendeu sobre o projeto (2-3 linhas)
2. Plano de implementação numerado baseado nas tasks do TASKS.md
3. Pergunte: "Aprovo esse plano e começo pela Task 1?"

Não implemente nada até o usuário aprovar.

Seja direto. Não faça introduções longas. O usuário não é programador, então explique em linguagem simples o que cada passo faz.
