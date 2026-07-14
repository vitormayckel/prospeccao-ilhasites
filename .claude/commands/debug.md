---
name: debug
description: Investigação profunda de erro.
argument-hint: [cole o erro completo]
---

O usuário vai colar um erro ou descrever um comportamento inesperado.

1. Leia o erro com atenção
2. Identifique os arquivos envolvidos pelo stack trace
3. Leia APENAS esses arquivos (não leia o projeto inteiro)
4. Explique a causa em linguagem simples: "O problema é [X] porque [Y]"
5. Corrija
6. Teste rodando o comando relevante (npm run dev, npm run build)
7. Se resolver, diga: "Corrigido. O problema era [explicação simples]."
8. Se não resolver na primeira tentativa, tente mais 2 abordagens antes de pedir ajuda

Não invente soluções. Se não souber a causa, diga: "Preciso ver mais contexto. Me manda [informação específica]."
