// =====================================================================
// Valida a RECUPERAÇÃO DE ANÁLISES como job da fila.
//
// Executa o runner REAL contra Postgres embutido (PGlite). Prova o que o
// operador pediu: um clique cria o job e o encadeamento o leva até zerar a
// fila, sem clicar de novo.
//
// Uso: node --experimental-strip-types --conditions=react-server \
//        --import ./scripts/ts-alias-loader.mjs scripts/analysis-recovery-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { createJobsRepository } from "@/server/repositories/jobs-repository";
import { createAiAnalysesRepository } from "@/server/repositories/ai-analyses-repository";
import { createAnalysisRecoveryRunner } from "@/server/services/analysis-recovery-runner";
import { normalizeRows } from "@/lib/database/sql";

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
const section = (t) => console.log("\n── " + t + " ──");

const pg = new PGlite({ extensions: { pg_trgm } });
await pg.waitReady;
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await pg.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await pg.exec(readFileSync(seedPath, "utf8"));

const adapt = (client) => ({
  async query(text, params = []) {
    return normalizeRows((await client.query(text, params)).rows);
  },
  async transaction(fn) {
    if (client !== pg) return fn(adapt(client));
    return pg.transaction(async (txn) => fn(adapt(txn)));
  },
});
const db = adapt(pg);
const q = async (t, p = []) => (await pg.query(t, p)).rows;
console.log("✓ schema + seed carregados (migrations 0001..0013)");

const jobs = createJobsRepository(db);
const aiAnalyses = createAiAnalysesRepository(db);

/** Análise simulada: marca a empresa como analisada. */
let chamadas = 0;
let falharAte = 0;
const analysis = {
  async analyzeCompany(companyId) {
    chamadas++;
    if (chamadas <= falharAte) {
      await q(
        "update companies set review_status='analysis_failed' where id=$1",
        [companyId],
      );
      return { ok: false, companyId, error: "IA indisponível" };
    }
    await q(
      `update companies set review_status='pending_review', pipeline_stage='analyzed',
              score=80, commercial_score=72, website_class='reasonable' where id=$1`,
      [companyId],
    );
    return { ok: true, companyId, score: 80 };
  },
};
const runner = createAnalysisRecoveryRunner({ jobs, aiAnalyses, analysis });

async function semear(n, status = "analysis_failed") {
  await q("delete from ai_analyses");
  await q("delete from companies");
  for (let i = 0; i < n; i++) {
    await q(
      `insert into companies (name, normalized_name, city, state, review_status, pipeline_stage)
       values ($1,$2,'Vitória','ES',$3,'new')`,
      [`Empresa ${i}`, `empresa ${i}`, status],
    );
  }
}

async function criar() {
  const total = await aiAnalyses.countPendingAnalysis();
  return jobs.createAnalysisRecoveryUnique({
    idempotencyKey: `recovery:${Math.random()}`,
    total,
    maxAiCalls: total + 10,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
  });
}

/** Encadeamento: repete ticks até o job encerrar, como a rota faz. */
async function drenar(maxTicks = 40) {
  let ticks = 0;
  for (let i = 0; i < maxTicks; i++) {
    const r = await runner.runTick({ budgetMs: 4000 });
    ticks++;
    if (!r.picked) break;
    if (!r.hasMoreWork) break;
  }
  return ticks;
}

// =====================================================================
section("1. Um clique zera uma fila de 22 empresas");
await semear(22);
chamadas = 0;
falharAte = 0;
{
  const { job, alreadyRunning } = await criar();
  assert(!alreadyRunning, "job criado (não havia outro ativo)");
  assert(job.target_qualified === 22, `total registrado = 22 (obtido: ${job.target_qualified})`);
  assert(job.phase === "ANALYZE", "job começa em ANALYZE (sem busca nem dedup)");

  const ticks = await drenar();
  const [final] = await q("select * from job_queue where id=$1", [job.id]);
  assert(final.status === "completed", `job concluiu sozinho (status=${final.status})`);
  assert(final.finish_reason === "fila_zerada", `motivo = fila_zerada (obtido: ${final.finish_reason})`);
  assert(
    final.count_analyzed === 22,
    `22 empresas analisadas (obtido: ${final.count_analyzed})`,
  );
  console.log(`   fatias usadas: ${ticks} (a analise simulada e instantanea; em producao sao ~3 empresas por fatia)`);

  const [restam] = await q(
    `select count(*)::int as n from companies
      where review_status in ('pending_analysis','analysis_failed') and deleted_at is null`,
  );
  assert(restam.n === 0, `nenhuma empresa restou pendente (obtido: ${restam.n})`);
  assert(
    (await jobs.msUntilNextRunnable()) === null,
    "fila vazia ao final: a corrente encerra sozinha",
  );
}

// =====================================================================
section("2. Progresso é observável durante a execução");
await semear(9);
chamadas = 0;
falharAte = 0;
{
  const { job } = await criar();
  const leituras = [];
  for (let i = 0; i < 6; i++) {
    const r = await runner.runTick({ budgetMs: 1 }); // fatia minima: 1 lote por tick
    const [cur] = await q("select * from job_queue where id=$1", [job.id]);
    leituras.push(`${cur.count_analyzed + cur.count_failed}/${cur.target_qualified}`);
    if (!r.picked || !r.hasMoreWork) break;
  }
  console.log("   progresso observado:", leituras.join(" → "));
  assert(leituras.length > 1, "progresso avança em etapas, não de uma vez");
  assert(
    leituras.at(-1) === "9/9",
    `termina em 9/9 (obtido: ${leituras.at(-1)})`,
  );
}

// =====================================================================
section("3. Um job ativo por vez (duplo clique não duplica custo)");
await semear(5);
chamadas = 0;
falharAte = 0;
{
  const primeiro = await criar();
  const segundo = await criar();
  assert(segundo.alreadyRunning, "segundo clique NÃO cria outro job");
  assert(
    segundo.job.id === primeiro.job.id,
    "segundo clique devolve o job já em andamento",
  );
  const [n] = await q(
    "select count(*)::int as n from job_queue where job_type='analysis_recovery' and status in ('queued','running')",
  );
  assert(n.n === 1, `exatamente 1 job ativo (obtido: ${n.n})`);
}

// =====================================================================
section("4. Falha real da IA não trava a fila nem some da tela");
await semear(6);
chamadas = 0;
falharAte = 3; // as 3 primeiras chamadas falham
{
  const { job } = await criar();
  await drenar();
  const [final] = await q("select * from job_queue where id=$1", [job.id]);
  assert(final.status === "completed", "job encerra mesmo com falhas");
  assert(
    final.count_failed >= 1,
    `falhas contabilizadas (obtido: ${final.count_failed})`,
  );
  assert(
    final.count_analyzed + final.count_failed >= 6,
    `todas as 6 foram tentadas (obtido: ${final.count_analyzed + final.count_failed})`,
  );
  // As que falharam continuam visíveis e reprocessáveis num novo clique.
  const restantes = await aiAnalyses.countPendingAnalysis();
  console.log(`   ainda pendentes após a rodada: ${restantes}`);
  assert(
    restantes === final.count_failed,
    `as que falharam seguem reprocessáveis (${restantes} = ${final.count_failed})`,
  );
}

// =====================================================================
section("5. Orçamento de IA é teto rígido");
await semear(10);
chamadas = 0;
falharAte = 0;
{
  const { job } = await jobs.createAnalysisRecoveryUnique({
    idempotencyKey: `recovery:${Math.random()}`,
    total: 10,
    maxAiCalls: 4, // menos que a fila
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  await drenar();
  const [final] = await q("select * from job_queue where id=$1", [job.id]);
  assert(
    final.used_ai_calls <= 4,
    `nunca ultrapassa o teto de chamadas (obtido: ${final.used_ai_calls}/4)`,
  );
  assert(
    final.finish_reason === "limite_chamadas_ia",
    `encerra explicando o motivo (obtido: ${final.finish_reason})`,
  );
}

// =====================================================================
console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("✅ Recuperação de análises validada (5 cenários).");
await pg.close();
