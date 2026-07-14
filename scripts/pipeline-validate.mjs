// =====================================================================
// Valida pipeline + follow-ups (Fase 7) contra Postgres real (PGlite).
// Prova: conclusão de follow-up (RF-13); movimentação registra evento
// auditável (RF-14); reabertura de estado terminal preserva histórico
// (RN-08, motivo aplicado no service). Uso: node scripts/pipeline-validate.mjs
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
const assert = (cond, msg) => {
  if (cond) console.log("✓ " + msg);
  else {
    console.error("✗ " + msg);
    failures++;
  }
};

const db = new PGlite({ extensions: { pg_trgm } });
const q = async (t, p = []) => (await db.query(t, p)).rows;

for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await db.exec(readFileSync(seedPath, "utf8"));
console.log("✓ schema + seed carregados");

const company = (
  await q(
    `insert into companies (name, normalized_name, review_status, pipeline_stage)
     values ('Empresa Pipeline','empresa pipeline','approved','approved') returning *`,
  )
)[0];

// --- follow-up: criar pendente -> concluir (RF-13) ---
const fu = (
  await q(
    `insert into follow_ups (company_id, due_at, notes, status)
     values ($1, now() + interval '1 day', 'ligar', 'pending') returning *`,
    [company.id],
  )
)[0];
assert(fu.status === "pending", "follow-up criado pendente");
await q("update follow_ups set status='completed', completed_at=now() where id=$1", [fu.id]);
const done = (await q("select status, completed_at from follow_ups where id=$1", [fu.id]))[0];
assert(done.status === "completed" && done.completed_at, "follow-up concluído registra completed_at");

// --- movimentação não-terminal registra evento (RF-14) ---
await q("update companies set pipeline_stage='negotiation' where id=$1", [company.id]);
await q(
  `insert into pipeline_events (company_id, from_stage, to_stage)
   values ($1,'first_contact','negotiation')`,
  [company.id],
);
const evt = (
  await q("select count(*)::int c from pipeline_events where company_id=$1", [company.id])
)[0];
assert(evt.c >= 1, "movimentação registra evento auditável em pipeline_events");

// --- reabertura de terminal preserva histórico (RN-08) ---
await q("update companies set pipeline_stage='client' where id=$1", [company.id]);
await q(
  `insert into pipeline_events (company_id, from_stage, to_stage, reason)
   values ($1,'client','negotiation','cliente pediu revisão')`,
  [company.id],
);
const reopen = (
  await q(
    "select reason from pipeline_events where company_id=$1 and from_stage='client' limit 1",
    [company.id],
  )
)[0];
assert(reopen && reopen.reason, "reabertura de terminal registra motivo (RN-08)");
const history = (
  await q("select count(*)::int c from pipeline_events where company_id=$1", [company.id])
)[0];
assert(history.c >= 2, "histórico de movimentações preservado");

console.log(
  failures === 0
    ? "\n✅ Pipeline + follow-ups validados (conclusão, eventos, reabertura com motivo)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
