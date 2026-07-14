# CHECKLIST 1: IDENTIFICAÇÃO DE PROJETO
Como encontrar o projeto certo pra vender

## Antes da conversa com o cliente

[ ] Pesquisei o negócio do cliente (site, redes, segmento)
[ ] Identifiquei 2-3 dores comuns do segmento dele
[ ] Preparei os 5 tipos de projeto que posso oferecer
[ ] Tenho exemplo de projeto similar que já entreguei ou estudei

## Durante a conversa

[ ] Perguntei: O que consome mais tempo da sua equipe?
[ ] Perguntei: Que processo vocês fazem manualmente que deveria ser automático?
[ ] Perguntei: Quanto custa pra vocês esse problema hoje? (tempo, gente, erro)
[ ] Identifiquei o processo manual, lento ou caro
[ ] Entendi quem sofre com o problema (dono, equipe, cliente final)
[ ] Entendi o volume (quantas vezes por dia/semana/mês acontece)

## Classificação do projeto

[ ] O projeto se encaixa em 1 dos 5 tipos (painel, documentos, atendimento, propostas, monitoramento)
[ ] O cliente tem orçamento compatível (R$5K a R$30K)
[ ] O problema é real e urgente (não é "seria legal ter")
[ ] Consigo construir com Claude Code em 7 a 30 dias
[ ] O ROI pro cliente é claro e calculável

## Decisão

[ ] Projeto aprovado: vale investir tempo
[ ] Próximo passo definido: montar PRD ou enviar proposta

---

# CHECKLIST 2: CONSTRUÇÃO
Do PRD ao projeto rodando

## Planejamento

[ ] PRD escrito com: resumo, problema, stack, funcionalidades, banco, regras, limites
[ ] CLAUDE.md criado na raiz do projeto com stack, regras de código, design e anti-patterns
[ ] TASKS.md criado com tasks numeradas e subtasks
[ ] Busquei projetos semelhantes no GitHub pra referência
[ ] Revisei o PRD antes de começar a construir

## Setup

[ ] Pasta do projeto criada
[ ] Git inicializado (git init)
[ ] Projeto Next.js criado (npx create-next-app)
[ ] Dependências instaladas (Tailwind, Shadcn, Supabase, Framer Motion)
[ ] Estrutura de pastas organizada (/app, /components, /lib)
[ ] Supabase configurado (projeto criado, keys no .env.local)
[ ] Rodando em localhost sem erro

## Construção com Claude Code

[ ] CLAUDE.md e TASKS.md na raiz
[ ] Prompt inicial: Leia o CLAUDE.md e o TASKS.md. Analise antes de implementar.
[ ] Plano de implementação revisado e aprovado
[ ] Task 1 implementada e testada
[ ] Commit feito após Task 1
[ ] Tasks seguintes implementadas uma a uma com teste e commit
[ ] /compact manual feito ao atingir 50% do contexto
[ ] Nunca usei auto-compact
[ ] Projeto completo rodando em localhost

## Qualidade

[ ] Todas as páginas funcionam sem erro no console
[ ] Responsivo testado no mobile (Chrome DevTools)
[ ] Formulários validam entrada do usuário
[ ] Mensagens de erro claras pro usuário
[ ] Loading states implementados (skeleton ou spinner)
[ ] Dados sensíveis no .env.local (nunca commitados)

---

# CHECKLIST 3: DEPLOY
Supabase + Vercel + GitHub

## GitHub

[ ] Repositório criado no GitHub
[ ] .gitignore inclui node_modules, .env.local, .next
[ ] Código commitado e pushed
[ ] README.md básico com nome do projeto e stack

## Supabase

[ ] Projeto criado no Supabase
[ ] Tabelas criadas conforme PRD
[ ] RLS (Row Level Security) habilitado em todas as tabelas
[ ] Políticas de acesso configuradas
[ ] Storage buckets criados (se necessário)
[ ] Variáveis copiadas: SUPABASE_URL e SUPABASE_ANON_KEY

## Vercel

[ ] Conta criada na Vercel
[ ] Projeto importado do GitHub
[ ] Variáveis de ambiente configuradas na Vercel (as mesmas do .env.local)
[ ] Build rodou sem erro
[ ] URL de preview funcionando
[ ] Domínio customizado configurado (se tiver)

## Teste em produção

[ ] Todas as páginas carregam corretamente
[ ] Funcionalidades principais testadas (CRUD, auth, upload)
[ ] Mobile testado em celular real
[ ] Velocidade aceitável (sem loading de mais de 3 segundos)
[ ] Sem erros no console do navegador
[ ] HTTPS ativo (cadeado verde)

---

# CHECKLIST 4: REFINAMENTO DE AGENTE
Do prompt bruto ao agente que funciona de verdade

## Estrutura do prompt

[ ] Papel definido (quem o agente é)
[ ] Contexto claro (onde ele atua, pra quem)
[ ] Regras explícitas (o que pode e não pode fazer)
[ ] Tom de voz definido (formal, informal, técnico)
[ ] Formato de resposta especificado
[ ] Limites claros (quando encaminhar pra humano)
[ ] Exemplos de interação incluídos (few-shot)

## Base de conhecimento

[ ] Documentos relevantes organizados (FAQ, manual, catálogo)
[ ] Formato limpo (sem formatação quebrada, sem lixo)
[ ] Informações atualizadas
[ ] Respostas padrão definidas pras perguntas mais frequentes

## Teste do agente

[ ] Testei com 10 perguntas que o cliente real faria
[ ] Testei com 5 perguntas fora do escopo (deve recusar ou encaminhar)
[ ] Testei com perguntas ambíguas
[ ] Testei tom de voz em diferentes contextos
[ ] Respostas estão corretas e completas
[ ] Agente não inventa informação (não alucina)
[ ] Tempo de resposta aceitável

## Ajuste fino

[ ] Corrigi respostas erradas ajustando o prompt
[ ] Adicionei regras pra casos que falharam no teste
[ ] Refinei tom de voz baseado nos testes
[ ] Testei novamente após ajustes
[ ] Cliente aprovou o comportamento do agente

---

# CHECKLIST 5: ENTREGA PRO CLIENTE
O que conferir antes de entregar o projeto

## Antes da reunião de entrega

[ ] Projeto rodando na URL de produção sem erros
[ ] Todos os dados de teste removidos
[ ] Credenciais de acesso do cliente criadas
[ ] Documentação básica escrita (o que faz, como acessar, contatos)
[ ] Backup do banco de dados feito
[ ] Gravei um vídeo de 2-3 minutos mostrando as funcionalidades

## Durante a reunião

[ ] Apresentei o projeto mostrando o problema que ele resolve
[ ] Mostrei cada funcionalidade principal
[ ] Deixei o cliente testar ao vivo
[ ] Anotei feedbacks e ajustes solicitados
[ ] Alinhei prazo pra ajustes (se houver)
[ ] Expliquei como acessar e usar no dia a dia

## Após a entrega

[ ] Ajustes solicitados implementados
[ ] Credenciais finais enviadas pro cliente
[ ] Documentação entregue (PDF ou link)
[ ] Suporte pós-entrega definido (30 dias, email, WhatsApp)
[ ] Nota fiscal emitida
[ ] Pagamento confirmado
[ ] Pedido de depoimento/indicação feito

## Recorrência

[ ] Proposta de manutenção mensal apresentada (R$500 a R$2K/mês)
[ ] Escopo da manutenção definido (updates, suporte, melhorias)
[ ] Contrato de manutenção assinado (se aceito)

---

# CHECKLIST 6: PRECIFICAÇÃO
Como calcular o preço certo pro seu projeto

## Entendendo o custo do problema

[ ] Quantas horas/semana o cliente gasta com o processo manual
[ ] Quantas pessoas estão envolvidas no processo
[ ] Qual o custo/hora dessas pessoas (salário dividido por horas)
[ ] Custo mensal do problema = horas x pessoas x custo/hora
[ ] Custo anual do problema = custo mensal x 12
[ ] Existem custos indiretos? (erro, retrabalho, perda de cliente)

## Calculando o ROI

[ ] Quanto a ferramenta economiza por mês (tempo, gente, erro)
[ ] Economia anual estimada
[ ] ROI = economia anual dividido pelo preço do projeto
[ ] Tempo de payback = preço dividido pela economia mensal
[ ] O payback é menor que 3 meses? (ideal)

## Definindo o preço

[ ] Preço base: 10-20% do ROI anual do cliente
[ ] Comparei com as faixas de referência por tipo de projeto
[ ] Preço cobre meu custo (tempo + ferramentas + impostos)
[ ] Preço está na faixa que o segmento do cliente aceita
[ ] Defini condições de pagamento (à vista com desconto, parcelado)

## Faixas de referência

[ ] Painel de gestão interno: R$5K a R$8K
[ ] Análise de documentos com IA: R$8K a R$12K
[ ] Automação de atendimento (agente WhatsApp): R$5K a R$10K
[ ] Gerador de propostas/documentos: R$6K a R$10K
[ ] Monitoramento e alertas: R$10K a R$15K
[ ] Projetos complexos (multi-agente, SaaS): R$15K a R$30K+

## Na hora de apresentar

[ ] Apresento o valor, não o preço
[ ] Frase: O investimento é de R$X. Com base no que conversamos, isso se paga em [tempo] porque [ROI].
[ ] Nunca negocio preço. Nego escopo se necessário.
[ ] Se o cliente achar caro, mostro o custo de não resolver o problema

---

Ana Paula Perci — Imersão Claude Code Pro — 2026
Material exclusivo do aluno
