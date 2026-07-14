---
name: agente
description: Cria um agente de IA profissional passo a passo.
---

Vou te ajudar a criar um agente de IA profissional. Vou te fazer perguntas uma por vez.

1. "Pra quem é esse agente? (ex: clínica, restaurante, escritório, loja)"

2. "O que ele faz? (ex: responde dúvidas, agenda consultas, anota pedidos)"

3. "Onde ele vai atuar? (ex: WhatsApp, chat no site, email)"

4. "Qual o tom de voz? (ex: formal e educado, informal e simpático, técnico e direto)"

5. "O que ele NÃO deve fazer? (ex: não dar desconto, não falar de concorrente, não inventar informação)"

Depois das respostas, gere o prompt do agente com:

- Papel: quem o agente é
- Contexto: onde atua, pra qual empresa, qual o público
- Regras: o que pode e não pode fazer (lista detalhada)
- Tom de voz: como fala, que palavras usa e evita
- Formato de resposta: tamanho, estrutura
- Limites: quando encaminhar pra humano
- 3 exemplos de interação (pergunta do usuário + resposta ideal)

Salve como docs/prompt-agente-[nome].md

Depois diga:

"Prompt do agente pronto. Pra testar, copie esse prompt e cole no Claude.ai ou na plataforma que vai usar (n8n, Dify, API). Teste com 10 perguntas reais antes de entregar pro cliente."

"Tem o checklist de refinamento em docs/checklists/refinamento-agente.md pra te guiar nos testes."
