# Deduplicação de empresas — critérios e decisões de negócio

Este documento registra **decisões comerciais**, não detalhes de implementação.
A implementação está em `src/server/services/job-runner.ts` (fase DEDUP) e em
`src/server/services/collection-service.ts`.

## Ordem de prioridade

A primeira regra que casar decide, e a busca para:

1. **Place ID do Google** — identidade forte, atribuída pelo próprio provedor.
2. **Telefone (E.164)** — identidade forte. Ver decisão de negócio abaixo.
3. **Domínio próprio** — identidade fraca, sujeita a veto por telefone.
4. **Nome + cidade** — identidade fraca, usada por similaridade (`pg_trgm`).

## Decisão de negócio: telefone idêntico significa a mesma empresa

**Regra:** dois resultados com o mesmo telefone em E.164 são tratados como
**a mesma empresa**, ainda que tenham nomes, endereços ou Place IDs diferentes.

**Por quê.** No cadastro do Google é comum o mesmo negócio aparecer mais de uma
vez: nome antigo e nome novo, nome fantasia e razão social, um anúncio da
clínica e outro do profissional que atende nela. O telefone comercial é o
identificador que o negócio efetivamente controla e raramente compartilha.

**O que isso custa.** Casos legítimos em que empresas distintas compartilham
telefone são unificados por engano. Os principais são:

- consultórios que dividem uma mesma recepção ou secretária;
- profissionais autônomos que atendem no mesmo endereço e usam a linha da casa;
- negócios que usam o celular de um sócio comum.

**Por que aceitamos esse custo.** O erro oposto — abordar duas vezes o mesmo
número de WhatsApp com nomes diferentes — é visível para o prospecto e queima o
contato. Uma fusão indevida apenas reduz a fila; uma duplicata indevida chega
até a pessoa. Como o envio é sempre manual, o operador percebe a fusão ao abrir
o registro e pode separá-la; ele não tem como desfazer uma mensagem enviada.

**Exemplo real** (E2E de 2026-07-21, Vitória/ES — as quatro fusões que
permaneceram, todas com telefone idêntico):

```
ODONTO DREAMS            ← Instituto Vina
Conceito Odontologia     ← Dra. Diana Barcellos
Central Odonto Capixaba  ← MedSerra
Dra Léa Paula Pagani     ← Clínica Contenta
```

**Se essa decisão mudar:** o ponto único a alterar é a etapa `findByPhone` na
cadeia de dedup, nos dois arquivos citados acima. Rebaixá-la para identidade
fraca (sujeita a confirmação por nome ou endereço) é a alternativa natural.

## Decisão de negócio: domínio de rede social nunca identifica uma empresa

**Regra:** domínios de redes sociais, encurtadores e construtores de site
genéricos (Instagram, Facebook, Linktree, WhatsApp, TikTok, `bit.ly`,
`business.site`, entre outros — a lista está em `SOCIAL_DOMAINS`, em
`src/server/services/normalization.ts`) são **descartados** como identidade.

**Por quê.** O Google devolve o perfil de Instagram no campo `website` quando a
empresa não tem site próprio. Isso é a norma em negócios locais pequenos, que
são exatamente o público-alvo. Tratar `instagram.com` como identidade fundiu 14
negócios distintos em um só registro antes da correção.

## Decisão de negócio: telefone divergente veta a fusão por domínio

**Regra:** duas empresas com o **mesmo domínio próprio** mas **telefones
diferentes** não são fundidas.

**Por quê.** Redes e franquias compartilham um site institucional entre
unidades. "Rede Odonto Vitória", "Rede Odonto Vila Velha" e "Rede Odonto
Cariacica" são três unidades, com três telefones e três endereços, sob
`redeodonto.com.br` — e são três oportunidades comerciais separadas, porque
cada unidade decide a própria contratação.

O domínio compartilhado sem telefone conflitante (um dos lados sem telefone,
ou telefones iguais) continua fundindo: é o caso do site próprio de um único
negócio.

## Reversibilidade

Fusões aplicadas retroativamente por script ficam registradas em
`unmerge_audit` e correções de município/UF em `backfill_uf_audit` (schema em
`supabase/migrations/0010_backfill_audit.sql`). Ambos os scripts aceitam
`--rollback`.
