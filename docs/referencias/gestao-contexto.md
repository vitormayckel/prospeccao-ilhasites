# Gestão de contexto e economia de tokens

## O problema

O Claude Code tem uma janela de contexto que se enche conforme você conversa. Quando enche, a qualidade das respostas cai. Pior: você gasta mais dinheiro.

A boa notícia: com práticas simples você usa 50% menos tokens e o resultado fica melhor.

## Regras de ouro

### 1. Uma task por sessão
Não tente fazer tudo numa sessão só. Faça uma task, commite, e inicie sessão nova pra próxima. Contexto limpo = resposta melhor.

### 2. Compact manual a 50%
Quando o Claude Code avisar que o contexto está ficando grande (ou quando perceber respostas mais confusas), faça /compact manualmente. NUNCA use auto-compact.

### 3. Prompts curtos e diretos
Ruim: "Eu estava pensando que talvez a gente pudesse considerar adicionar um componente de navbar que tenha links pra todas as páginas e que seja responsivo e que tenha animação de hambúrguer no mobile"

Bom: "Crie navbar responsiva com links pra: Home, Sobre, Contato. Hambúrguer no mobile."

### 4. Referencie por caminho
Ruim: "Naquele componente de header que tem o logo e os links"
Bom: "Em @/components/Header.tsx"

### 5. Não peça pra listar tudo
Ruim: "Me mostre todos os arquivos do projeto"
Bom: "Leia @/components/Header.tsx"

Ruim: "Me mostre todo o código do banco"
Bom: "Leia a tabela users no schema do Supabase"

### 6. Não explique o que o Claude já sabe
Ruim: "O Next.js é um framework React que usa App Router pra criar rotas baseadas em arquivos. Eu quero que você use isso pra criar uma página de login."
Bom: "Crie página de login em /app/login/page.tsx"

### 7. Commite a cada task
Não acumule mudanças. Commite cedo e frequente. Se algo der errado, você reverte sem perder tudo.

### 8. Use os comandos /slash
Os comandos desse framework já têm os prompts otimizados. Em vez de escrever prompts longos, use /construir, /corrigir, /revisar, etc.

### 9. Sessão nova pra assunto novo
Se estava construindo o frontend e agora quer criar um agente, feche a sessão e abra uma nova. Misturar assuntos polui o contexto.

### 10. CLAUDE.md curto
Seu CLAUDE.md deve ter menos de 200 linhas. O Claude lê ele no início de cada sessão. Se for longo, desperdiça tokens e o Claude começa a ignorar partes.

## Quanto custa

Estimativa de tokens por operação:
- Abrir sessão nova: ~20K tokens (lê CLAUDE.md e analisa projeto)
- Task simples (criar componente): ~30-50K tokens
- Task média (página completa): ~80-120K tokens
- Task complexa (feature com banco + API): ~150-200K tokens
- Janela máxima: ~200K tokens (depende do modelo)

Quando o contexto passa de 100K tokens, a qualidade começa a degradar. Faça compact ou inicie sessão nova.

## Sinais de que precisa compact

- Claude começa a repetir coisas que já disse
- Claude esquece regras do CLAUDE.md
- Claude cria arquivos que já existem
- Claude usa padrões diferentes dos que você definiu
- Respostas ficam mais longas e menos precisas
