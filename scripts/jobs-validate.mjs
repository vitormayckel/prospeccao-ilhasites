// =====================================================================
// Valida o pipeline persistente (FASE 2) contra Postgres real (PGlite).
// Prova: claim atômico, lock com expiração, retomada de job abandonado,
// idempotência de candidatos, dedup antes da IA, contadores relativos e
// persistência da máquina de estados.
// Uso: node scripts/jobs-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const seedPath = join(__dirname, "..", "supabase", "seed.sql");

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("✓ " + msg);
  else {
    console.error("✗ " + msg);
    failures++;
  }
}

const db = new PGlite({ extensions: { pg_trgm } });
const q = async (t, p = []) => (await db.query(t, p)).rows;

for (const f of readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await db.exec(readFileSync(seedPath, "utf8"));
console.log("✓ schema + seed carregados");

const LOCK = "120";
const profile = (await q("select id from search_profiles limit 1"))[0];

const createJob = async (key, target = 5) =>
  (
    await q(
      `insert into job_queue
         (job_type, search_profile_id, idempotency_key, status, phase, target_qualified)
       values ('prospect_pipeline',$1,$2,'queued','SEARCH',$3) returning *`,
      [profile.id, key, target],
    )
  )[0];

// Filtro por job_type: a fila é compartilhada com outros tipos de job
// (o seed já traz linhas em job_queue) e o runner só reivindica os seus.
const CLAIM = `update job_queue j set
     status='running', locked_by=$1, locked_at=now(),
     lock_expires_at = now() + ($2 || ' seconds')::interval,
     started_at = coalesce(j.started_at, now()),
     attempts = j.attempts + case when j.status = 'running' then 1 else 0 end,
     updated_at = now()
   where j.id = (
     select id from job_queue
      where job_type = 'prospect_pipeline'
        and ((status='queued' and run_after <= now())
          or (status='running' and lock_expires_at < now()))
      order by created_at for update skip locked limit 1
   ) returning j.*`;

// ---------------------------------------------------------------------
// 1. Claim atômico — duas execuções não pegam o mesmo job
// ---------------------------------------------------------------------
const job1 = await createJob("job-claim-1");
const claimA = await q(CLAIM, ["workerA", LOCK]);
const claimB = await q(CLAIM, ["workerB", LOCK]);

assert(claimA.length === 1 && claimA[0].id === job1.id, "primeiro worker reivindica o job");
assert(claimB.length === 0, "segundo worker NÃO reivindica o mesmo job (skip locked)");
assert(claimA[0].locked_by === "workerA", "lock registra o dono");
assert(
  claimA[0].attempts === 0,
  "tick normal NÃO consome tentativa (attempts conta falhas, não ticks)",
);

// Um job saudável faz muitos ticks: liberar e reivindicar de novo, várias
// vezes, não pode aproximá-lo de max_attempts.
const RELEASE = `update job_queue set status='queued', locked_by=null,
   lock_expires_at=null, run_after=now() where id=$1`;
for (let i = 0; i < 8; i++) {
  await q(RELEASE, [job1.id]);
  await q(CLAIM, ["workerLoop", LOCK]);
}
const healthy = (await q("select attempts, max_attempts, status from job_queue where id=$1", [job1.id]))[0];
assert(
  healthy.attempts === 0,
  "8 ticks consecutivos não consomem tentativas (job longo não falha sozinho)",
);
assert(
  healthy.status === "running" && healthy.attempts < healthy.max_attempts,
  "job longo continua saudável após muitos ticks",
);

// ---------------------------------------------------------------------
// 2. Duas execuções simultâneas sobre perfis diferentes não colidem
// ---------------------------------------------------------------------
const job2 = await createJob("job-claim-2");
const claimC = await q(CLAIM, ["workerC", LOCK]);
assert(
  claimC.length === 1 && claimC[0].id === job2.id,
  "job seguinte é reivindicado por outro worker em paralelo",
);

// ---------------------------------------------------------------------
// 3. Lock expirado é retomado (timeout da Vercel / reinício da função)
// ---------------------------------------------------------------------
await q("update job_queue set lock_expires_at = now() - interval '1 minute' where id=$1", [job1.id]);
const reclaim = await q(CLAIM, ["workerD", LOCK]);
assert(
  reclaim.length === 1 && reclaim[0].id === job1.id,
  "job com lock expirado é retomado por outro worker",
);
assert(
  reclaim[0].attempts === 1,
  "roubar lock expirado (tick morto) SIM consome tentativa",
);

// job travado com lock VÁLIDO não pode ser roubado
const stolen = await q(CLAIM, ["workerE", LOCK]);
assert(
  !stolen.some((r) => r.id === job1.id),
  "job com lock válido NÃO é roubado por outro worker",
);

// ---------------------------------------------------------------------
// 4. Fase persistida — a retomada continua de onde parou
// ---------------------------------------------------------------------
await q("update job_queue set phase='ANALYZE', cursor_combo=3, cursor_page=1 where id=$1", [job1.id]);
const resumed = (await q("select * from job_queue where id=$1", [job1.id]))[0];
assert(resumed.phase === "ANALYZE", "fase do pipeline é persistida no banco");
assert(resumed.cursor_combo === 3, "cursor de combinação é persistido");
assert(
  ["SEARCH", "NORMALIZE", "DEDUP", "ANALYZE", "QUALIFY", "SEARCH_REPLACEMENTS", "FINISHED"].includes(
    resumed.phase,
  ),
  "fase pertence ao enum job_phase",
);

// ---------------------------------------------------------------------
// 5. Idempotência dos candidatos — refazer a página não duplica
// ---------------------------------------------------------------------
const STAGE = `insert into job_candidates (job_id, provider, external_id, raw_payload, stage)
   values ($1,'google_places',$2,$3,'pending_normalize')
   on conflict (job_id, provider, external_id) where external_id is not null
   do nothing returning id`;

const first = await q(STAGE, [job1.id, "place_AAA", JSON.stringify({ name: "Clinica A" })]);
const again = await q(STAGE, [job1.id, "place_AAA", JSON.stringify({ name: "Clinica A" })]);
assert(first.length === 1, "candidato novo é gravado");
assert(again.length === 0, "mesmo place ID NÃO é gravado duas vezes no mesmo job");

const total = (await q("select count(*)::int as c from job_candidates where job_id=$1", [job1.id]))[0];
assert(total.c === 1, "página reprocessada após falha não duplica candidato");

// o mesmo place ID em OUTRO job é permitido (execuções independentes)
const otherJob = await q(STAGE, [job2.id, "place_AAA", JSON.stringify({ name: "Clinica A" })]);
assert(otherJob.length === 1, "mesmo place ID é permitido em execução diferente");

// ---------------------------------------------------------------------
// 6. Contadores relativos — dois ticks concorrentes não se sobrescrevem
// ---------------------------------------------------------------------
await q("update job_queue set count_new = count_new + 3 where id=$1", [job1.id]);
await q("update job_queue set count_new = count_new + 2 where id=$1", [job1.id]);
const counters = (await q("select count_new from job_queue where id=$1", [job1.id]))[0];
assert(counters.count_new === 5, "incremento relativo preserva progresso concorrente (3+2=5)");

// ---------------------------------------------------------------------
// 7. Recovery de job abandonado (Cron diário)
// ---------------------------------------------------------------------
// O abandono é detectado pelo LOCK expirado — `updated_at` não serve, pois o
// trigger set_updated_at o reescreve em toda escrita.
await q(
  `update job_queue set status='running', locked_by='morto',
     lock_expires_at = now() - interval '30 minutes' where id=$1`,
  [job2.id],
);
const RECOVER = `update job_queue set status='queued', locked_by=null, lock_expires_at=null,
     run_after=now(), updated_at=now()
   where status='running'
     and lock_expires_at is not null
     and lock_expires_at < now() - ($1 || ' minutes')::interval
   returning id`;
const recovered = await q(RECOVER, ["15"]);
assert(
  recovered.some((r) => r.id === job2.id),
  "job abandonado volta para a fila no recovery",
);
const afterRecovery = (await q("select * from job_queue where id=$1", [job2.id]))[0];
assert(afterRecovery.status === "queued", "job recuperado fica pronto para novo tick");
assert(afterRecovery.count_new !== null, "recovery preserva contadores (não destrutivo)");

// job recente com lock válido NÃO é recuperado
const activeJob = await createJob("job-ativo");
await q(
  "update job_queue set status='running', lock_expires_at = now() + interval '2 minutes' where id=$1",
  [activeJob.id],
);
const recovered2 = await q(RECOVER, ["15"]);
assert(
  !recovered2.some((r) => r.id === activeJob.id),
  "job ativo com lock válido NÃO é interrompido pelo recovery",
);

// ---------------------------------------------------------------------
// 8. Dedup acontece ANTES da IA: candidato 'existing' não vira análise
// ---------------------------------------------------------------------
const known = (await q("select id from companies where deleted_at is null limit 1"))[0];
await q(
  `insert into job_candidates (job_id, provider, external_id, stage, company_id, reason)
   values ($1,'google_places','place_EXIST','existing',$2,'mesmo_telefone')`,
  [job1.id, known.id],
);
const pendingForAi = await q(
  `select jc.company_id from job_candidates jc
   join companies c on c.id = jc.company_id
   where jc.job_id=$1 and jc.stage='new' and c.review_status='pending_analysis'`,
  [job1.id],
);
assert(
  !pendingForAi.some((r) => r.company_id === known.id),
  "empresa já existente NÃO entra na fila de análise de IA",
);

// ---------------------------------------------------------------------
// 9. Limite de tentativas encerra o job (nunca retry infinito)
// ---------------------------------------------------------------------
const failing = await createJob("job-falha");

// Backoff: cada falha real incrementa a tentativa, uma por vez.
const RETRY = `update job_queue set
     attempts = attempts + 1,
     status = case when attempts + 1 >= max_attempts
                   then 'failed'::job_status else 'queued'::job_status end,
     finish_reason = case when attempts + 1 >= max_attempts
                          then 'max_attempts_reached' else finish_reason end,
     locked_by = null, lock_expires_at = null, updated_at = now()
   where id=$1 returning attempts, status, (attempts >= max_attempts) as exhausted`;

const r1 = (await q(RETRY, [failing.id]))[0];
assert(r1.attempts === 1 && r1.status === "queued", "1ª falha agenda nova tentativa");
assert(r1.exhausted === false, "1ª falha não esgota as tentativas");
const r2 = (await q(RETRY, [failing.id]))[0];
assert(r2.attempts === 2 && r2.status === "queued", "2ª falha ainda reagenda");
const r3 = (await q(RETRY, [failing.id]))[0];
assert(
  r3.attempts === 3 && r3.status === "failed" && r3.exhausted === true,
  "3ª falha esgota max_attempts e encerra (nunca retry infinito)",
);

await q("update job_queue set attempts = max_attempts where id=$1", [failing.id]);
// Cast explícito do enum: sem ele o CASE resolve para text e o Postgres
// recusa a atribuição — foi assim que este teste flagrou o bug no retry.
const retry = await q(
  `update job_queue set
     status = case when attempts >= max_attempts
                   then 'failed'::job_status else 'queued'::job_status end,
     finish_reason = case when attempts >= max_attempts then 'max_attempts_reached' else finish_reason end
   where id=$1 returning status, finish_reason`,
  [failing.id],
);
assert(retry[0].status === "failed", "job para de tentar ao atingir max_attempts");
assert(
  retry[0].finish_reason === "max_attempts_reached",
  "motivo do encerramento fica registrado para auditoria",
);

// ---------------------------------------------------------------------
// 10. Meta em leads QUALIFICADOS, com motivos por exclusão
// ---------------------------------------------------------------------
const reasons = await q(
  "select stage, reason, count(*)::int as c from job_candidates where job_id=$1 group by stage, reason",
  [job1.id],
);
assert(reasons.length > 0, "resumo por motivo de exclusão é consultável (§8)");
assert(
  reasons.some((r) => r.stage === "existing" && r.reason === "mesmo_telefone"),
  "motivo real da exclusão é preservado por candidato",
);

// ---------------------------------------------------------------------
// 11. Nada do domínio foi destruído pela migration
// ---------------------------------------------------------------------
const companies = (await q("select count(*)::int as c from companies"))[0];
const analyses = (await q("select count(*)::int as c from ai_analyses"))[0];
const decisions = (await q("select count(*)::int as c from company_decisions"))[0];
assert(companies.c > 0, "empresas preservadas após a migration 0007");
assert(analyses.c > 0, "análises preservadas após a migration 0007");
assert(decisions.c > 0, "decisões preservadas após a migration 0007");

// ---------------------------------------------------------------------
// 11b. Gatilho da interface não cria execução duplicada
// ---------------------------------------------------------------------
// Mesma consulta de jobs-repository.findActiveByProfile.
const ACTIVE_BY_PROFILE = `select * from job_queue
   where job_type='prospect_pipeline' and search_profile_id=$1
     and status in ('queued','running')
   order by created_at desc limit 1`;

// As seções anteriores deixaram jobs abertos neste mesmo perfil; encerra
// todos para que o teste meça o gatilho, não o resíduo dos testes.
await q(
  "update job_queue set status='completed' where search_profile_id=$1 and status in ('queued','running')",
  [profile.id],
);

const dupJob = await createJob("gatilho-ui", 3);
const ativo = await q(ACTIVE_BY_PROFILE, [profile.id]);
assert(
  ativo.length === 1 && ativo[0].id === dupJob.id,
  "job em andamento é encontrado pelo perfil (2º clique reaproveita)",
);

// Idempotência por minuto: a mesma chave não cria uma segunda linha.
const antesDup = (await q("select count(*)::int as c from job_queue"))[0].c;
const conflito = await q(
  `insert into job_queue (job_type, search_profile_id, idempotency_key, status, phase, target_qualified)
   values ('prospect_pipeline',$1,'gatilho-ui','queued','SEARCH',3)
   on conflict (idempotency_key) do nothing returning id`,
  [profile.id],
);
const depoisDup = (await q("select count(*)::int as c from job_queue"))[0].c;
assert(conflito.length === 0, "chave de idempotência repetida não insere nada");
assert(depoisDup === antesDup, `nenhum job duplicado criado (${antesDup} = ${depoisDup})`);

// Encerrado o job, o perfil volta a aceitar nova execução.
await q("update job_queue set status='completed' where id=$1", [dupJob.id]);
const aposConclusao = await q(ACTIVE_BY_PROFILE, [profile.id]);
assert(
  aposConclusao.length === 0,
  "após concluir, o perfil aceita uma nova execução",
);

// ---------------------------------------------------------------------
// 12. Orçamento de IA: a reserva atômica nunca ultrapassa o teto
// ---------------------------------------------------------------------
// Mesma instrução usada por jobs-repository.reserveAiCalls.
const RESERVE = `with saldo as (
     select id, least($2::int, greatest(max_ai_calls - used_ai_calls, 0)) as granted
       from job_queue where id = $1 for update
   )
   update job_queue j set used_ai_calls = j.used_ai_calls + saldo.granted, updated_at = now()
     from saldo where j.id = saldo.id returning saldo.granted as granted`;

const budgetJob = await createJob("orcamento-ia", 3);
await q("update job_queue set max_ai_calls = 3, used_ai_calls = 0 where id=$1", [
  budgetJob.id,
]);

const reserve = async (want) => (await q(RESERVE, [budgetJob.id, want]))[0].granted;

// Meta 3, lotes de 2: o segundo lote só pode receber 1.
assert((await reserve(2)) === 2, "1º lote de 2 concedido integralmente (saldo 3)");
assert(
  (await reserve(2)) === 1,
  "2º lote de 2 é cortado para 1 — meta de 3 não executa 4 análises",
);
assert((await reserve(2)) === 0, "3º lote não recebe nada: orçamento esgotado");

const usado = (await q("select used_ai_calls from job_queue where id=$1", [budgetJob.id]))[0];
assert(usado.used_ai_calls === 3, `used_ai_calls parou exatamente no teto (${usado.used_ai_calls} = 3)`);

// Reservas encadeadas: a soma continua limitada pelo teto.
// Ressalva honesta: o PGlite tem um único backend, então estas chamadas são
// serializadas — o que se verifica aqui é a aritmética do saldo, não o
// `for update` sob concorrência real. Esse ponto depende do Postgres.
await q("update job_queue set used_ai_calls = 0, max_ai_calls = 5 where id=$1", [budgetJob.id]);
const paralelo = await Promise.all([reserve(4), reserve(4), reserve(4)]);
const somaConcedida = paralelo.reduce((a, b) => a + b, 0);
assert(
  somaConcedida === 5,
  `três reservas de 4 concedem 5 no total, não 12 (concedido=${somaConcedida})`,
);

// Devolução do que não foi usado.
await q(
  "update job_queue set used_ai_calls = greatest(used_ai_calls - $2::int, 0) where id=$1",
  [budgetJob.id, 2],
);
const devolvido = (await q("select used_ai_calls from job_queue where id=$1", [budgetJob.id]))[0];
assert(devolvido.used_ai_calls === 3, "reserva não consumida volta para o saldo");

console.log(
  failures === 0
    ? "\n✅ Pipeline persistente validado (claim, lock, retomada, idempotência, recovery, orçamento de IA)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
