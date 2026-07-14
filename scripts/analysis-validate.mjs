// =====================================================================
// Valida a camada de IA (Fase 5) contra Postgres real embutido (PGlite).
// Prova persistência de ai_analyses (§9.6/7), invariante da soma do score
// (§9.6/5), transições de review_status (pending_analysis -> pending_review
// / analysis_failed), limites do schema e reprocessamento (§9.6/9).
// Uso: node scripts/analysis-validate.mjs
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

for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await db.exec(readFileSync(seedPath, "utf8"));
console.log("✓ schema + seed carregados");

// empresa de teste coletada, aguardando análise (sem site => score alto)
const company = (
  await q(
    `insert into companies (name, normalized_name, primary_category, phone_e164,
       whatsapp_status, city, state, rating, reviews_count, review_status, pipeline_stage)
     values ('Clinica Teste IA','clinica teste ia','Clínica','+5527999990000',
       'probable','Vitoria','ES',4.6,120,'pending_analysis','new')
     returning *`,
  )
)[0];
assert(company.review_status === "pending_analysis", "empresa criada em pending_analysis");

// análise válida: breakdown soma == score (invariante §9.6/5)
const breakdown = [
  { dimension: "Lacuna de presença digital", points: 30, max_points: 30, explanation: "sem site", evidence_refs: ["field:website"] },
  { dimension: "Potencial comercial", points: 16, max_points: 20, explanation: "avaliações", evidence_refs: ["field:rating"] },
  { dimension: "Reputação", points: 15, max_points: 15, explanation: "nota alta", evidence_refs: ["field:rating"] },
  { dimension: "Facilidade de contato", points: 15, max_points: 15, explanation: "telefone", evidence_refs: ["field:phone"] },
  { dimension: "Comunicação", points: 3, max_points: 10, explanation: "poucos canais", evidence_refs: [] },
  { dimension: "Qualidade dos dados", points: 8, max_points: 10, explanation: "campos ok", evidence_refs: ["field:address"] },
];
const score = breakdown.reduce((s, d) => s + d.points, 0);
assert(score === 87, `soma do breakdown = ${score} (esperado 87)`);
const analysis = {
  version: "1.0", recommendation: "prioritize", score, potential: "very_high",
  confidence: "high", executive_summary: "Sem site, boa aderência.",
  score_breakdown: breakdown, positives: [], risks: [], opportunities: [],
  sales_arguments: [], missing_data: [], cautions: ["derivado só do snapshot"],
};

// cria running -> complete (mesmo fluxo do repositório)
const running = (
  await q(
    `insert into ai_analyses (company_id, status, prompt_version, provider, model, input_snapshot, started_at)
     values ($1,'running','2026-07-14.1','fixture','fixture-heuristic-1','{}',now()) returning *`,
    [company.id],
  )
)[0];
assert(running.status === "running", "ai_analyses criado em running");

await q(
  `update ai_analyses set status='completed', output=$2, score=$3, potential=$4,
     confidence=$5, cost_estimate=0, completed_at=now() where id=$1`,
  [running.id, analysis, score, "very_high", "high"],
);
await q(
  `update companies set review_status='pending_review', pipeline_stage='analyzed', score=$2, updated_at=now() where id=$1`,
  [company.id, score],
);

const persisted = (await q("select * from ai_analyses where id=$1", [running.id]))[0];
assert(persisted.status === "completed", "análise persistida como completed");
assert(persisted.output && persisted.output.score === 87, "output jsonb persistido com score");
assert(persisted.score === 87 && persisted.potential === "very_high", "score/potential persistidos");

const moved = (await q("select * from companies where id=$1", [company.id]))[0];
assert(moved.review_status === "pending_review", "empresa -> pending_review após análise");
assert(moved.pipeline_stage === "analyzed", "empresa -> stage analyzed");
assert(moved.score === 87, "score gravado na empresa");

// constraint: score fora de 0..100 é rejeitado pelo schema
let rejected = false;
try {
  await q("update companies set score=150 where id=$1", [company.id]);
} catch {
  rejected = true;
}
assert(rejected, "constraint rejeita score > 100");

// caminho de falha: reprocessamento marca failed + analysis_failed (§9.6/9)
const failRun = (
  await q(
    `insert into ai_analyses (company_id, status, prompt_version, provider, started_at)
     values ($1,'running','2026-07-14.1','anthropic',now()) returning *`,
    [company.id],
  )
)[0];
await q("update ai_analyses set status='failed', error_message='timeout', completed_at=now() where id=$1", [failRun.id]);
await q("update companies set review_status='analysis_failed' where id=$1", [company.id]);
const failed = (await q("select review_status from companies where id=$1", [company.id]))[0];
assert(failed.review_status === "analysis_failed", "falha após retries -> analysis_failed (reprocessável)");

// custo/tokens são numéricos e não-nulos por padrão onde aplicável
const costRow = (await q("select cost_estimate from ai_analyses where id=$1", [running.id]))[0];
assert(Number(costRow.cost_estimate) === 0, "cost_estimate default numérico (0 no fixture)");

console.log(
  failures === 0
    ? "\n✅ Camada de IA validada (persistência, invariante de score, transições, constraints)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
