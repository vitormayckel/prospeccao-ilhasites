# Configuração na Vercel — plano Hobby

Checklist para configurar o projeto no painel da Vercel. **Nenhuma destas
variáveis está no repositório**; todas são definidas em
_Project → Settings → Environment Variables_.

## Como o pipeline roda no Hobby

| Peça | Papel |
| --- | --- |
| `waitUntil` | Encadeia o próximo tick após a resposta. **Motor principal.** |
| Cron diário (`0 6 * * *`) | Só recuperação: devolve à fila jobs com lock expirado. |
| Botão "Iniciar prospecção" | Cria o job e dispara o primeiro tick. |

O Hobby permite **um** Cron por dia, e é por isso que o encadeamento — não o
Cron — move o pipeline. No Pro, basta acrescentar um Cron mais frequente
apontando para `/api/jobs/tick` e aumentar `JOBS_TICK_BUDGET_MS`: o runner é o
mesmo e não há reescrita. O encadeamento pode continuar ativo junto, porque o
`claimNext` usa `for update skip locked` e dois disparos nunca pegam o mesmo job.

## Variáveis obrigatórias

| Variável | Ambientes | Valor |
| --- | --- | --- |
| `DATABASE_URL` | Production, Preview | Pooler **transaction**, porta **6543** |
| `JOBS_TICK_SECRET` | Production, Preview | 64 caracteres hex, gerado (abaixo) |
| `NEXT_PUBLIC_SUPABASE_URL` | todos | já configurada |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | todos | já configurada |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | já configurada |
| `GOOGLE_PLACES_API_KEY` | Production | já configurada |
| `ANTHROPIC_API_KEY` | Production | já configurada |

### `DATABASE_URL` — porta 6543

Esta é a correção do incidente `EMAXCONNSESSION`. Pegue a string em
_Supabase → Project Settings → Database → Connection string → **Transaction
pooler**_ e confira três pontos antes de salvar:

1. termina em **`:6543/postgres`** (não `:5432`);
2. o host contém **`pooler.supabase.com`**;
3. o usuário tem o sufixo do projeto: `postgres.<project-ref>`.

O formato é `postgresql://postgres.<ref>:<senha>@<host>:6543/postgres`.

> O modo *session* (5432) mantém uma conexão presa por cliente e é o que
> esgotava o limite de 15. O modo *transaction* devolve a conexão a cada
> transação, que é o comportamento certo para funções serverless.
>
> O adapter já envia `prepare: false`, exigido pelo modo transaction.

### `JOBS_TICK_SECRET`

Autentica as rotas internas `/api/jobs/*`. **Sem ela o encadeamento não
acontece e o pipeline não anda** — as rotas negam tudo por padrão, que é o
comportamento seguro.

Gere localmente e cole o resultado no painel:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use um valor **diferente** para Production e para Preview. Não reaproveite
senha existente e não comite o valor.

## Variáveis opcionais

| Variável | Padrão | Quando mexer |
| --- | --- | --- |
| `APP_URL` | `VERCEL_URL` | Só se usar domínio próprio. Ver abaixo. |
| `JOBS_TICK_BUDGET_MS` | `8000` | Ao migrar para o Pro. Teto 60000. |
| `ANALYSIS_CONCURRENCY` | `2` | Raramente. Ver o aviso abaixo. |
| `PIPELINE_MIN_SCORE` | `0` | Ao decidir desclassificar por nota. |
| `CRON_SECRET` | — | A Vercel injeta sozinha. Não configure. |

**`APP_URL`** — o encadeamento precisa de uma URL absoluta para chamar a si
mesmo. `VERCEL_URL` já é injetada e resolve o caso normal. Defina `APP_URL`
(com `https://`, sem barra final) se o app tiver domínio próprio, porque
`VERCEL_URL` aponta para o domínio de deploy, não para o seu.

**`ANALYSIS_CONCURRENCY`** — não passe de 4. Cada análise abre várias queries,
e o limitador do adapter permite 6 em voo. Subir isso reaproxima o sistema do
esgotamento de conexões que causou o incidente original.

**`PIPELINE_MIN_SCORE`** — `0` mantém o comportamento atual: nada é
desclassificado por nota, e a decisão continua sendo humana. Um valor acima de
zero passa a excluir empresas da meta automaticamente.

## Ambientes

| Ambiente | O que fazer |
| --- | --- |
| **Production** | Todas as obrigatórias. É o único que roda Cron. |
| **Preview** | Mesmas variáveis, **segredo e banco próprios**. Sem `GOOGLE_PLACES_API_KEY` / `ANTHROPIC_API_KEY`, o sistema cai nos provedores fixture e não gasta nada. |
| **Development** | Nada no painel. Local usa `.env.local`. |

> Não aponte o Preview para o mesmo banco da Production. Cada deploy de branch
> executaria o pipeline sobre os dados reais.

## Redeploy

**Sim, é necessário.** Variáveis são lidas no build e no boot da função;
alterá-las no painel não afeta um deploy já existente.

Depois de salvar tudo: _Deployments → o mais recente → ⋯ → Redeploy_, com
**"Use existing Build Cache" desmarcado**.

## Verificação depois do deploy

1. **Cron registrado** — _Settings → Cron Jobs_ deve listar `/api/jobs/recover`
   às 06:00 UTC. Vem de `vercel.json`, aparece após o primeiro deploy.
2. **Rota protegida** — `curl -i https://<app>/api/jobs/tick` sem cabeçalho
   deve responder **401**. Se responder 200, o segredo não foi aplicado.
3. **Pipeline vivo** — inicie uma prospecção pela interface e acompanhe a
   Visão geral. As fases devem avançar sozinhas (SEARCH → NORMALIZE → DEDUP →
   ANALYZE → QUALIFY). Se travar numa fase, o encadeamento não está fechando:
   confira `JOBS_TICK_SECRET` e `APP_URL`.
4. **Conexões** — _Supabase → Database → Connection pooling_. Em modo
   transaction as conexões ativas devem ficar em um dígito.

Comece com uma meta pequena (3 a 5) na primeira execução em produção: ela gasta
Google Places e Anthropic de verdade.
