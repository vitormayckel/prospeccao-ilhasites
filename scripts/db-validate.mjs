// =====================================================================
// Valida o schema executando migrations + seed em um Postgres real
// embutido (PGlite/WASM) — sem Docker. O mesmo SQL roda no Supabase.
// Uso: node scripts/db-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { buildDataset } from "./seed/dataset.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const seedPath = join(__dirname, "..", "supabase", "seed.sql");

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

const db = new PGlite({ extensions: { pg_trgm } });

// 1) Migrations em ordem
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const f of files) {
  const sql = readFileSync(join(migrationsDir, f), "utf8");
  try {
    await db.exec(sql);
    console.log("✓ migration " + f);
  } catch (e) {
    fail(`migration ${f}: ${e.message}`);
  }
}

// 2) Seed
try {
  await db.exec(readFileSync(seedPath, "utf8"));
  console.log("✓ seed.sql aplicado");
} catch (e) {
  fail(`seed: ${e.message}`);
}

// 3) Contagens conferem com o dataset
const dataset = buildDataset();
for (const [table, rows] of Object.entries(dataset)) {
  const r = await db.query(`select count(*)::int as c from ${table};`);
  const got = r.rows[0].c;
  if (got !== rows.length) {
    fail(`contagem ${table}: esperado ${rows.length}, obtido ${got}`);
  }
}
console.log("✓ contagens conferem com o dataset");

// 4) Invariantes de integridade
const checks = [
  [
    "toda empresa com review_status approved tem decisão de aprovação",
    `select count(*)::int as c from companies c
     where c.review_status = 'approved'
       and not exists (select 1 from company_decisions d
                       where d.company_id = c.id and d.decision = 'approved')`,
    0,
  ],
  [
    "decisões snoozed possuem snoozed_until (constraint)",
    `select count(*)::int as c from company_decisions
     where decision = 'snoozed' and snoozed_until is null`,
    0,
  ],
  [
    "há follow-ups pendentes (hoje/atrasados) para o dashboard",
    `select case when count(*) > 0 then 0 else 1 end as c
     from follow_ups where status = 'pending'`,
    0,
  ],
  [
    "busca por trigram funciona (índice gin)",
    `select case when count(*) > 0 then 0 else 1 end as c
     from companies where normalized_name % 'clinica'`,
    0,
  ],
  [
    "empresas em análise pendente existem",
    `select case when count(*) > 0 then 0 else 1 end as c
     from companies where review_status = 'pending_review'`,
    0,
  ],
];
for (const [label, sql, expected] of checks) {
  const r = await db.query(sql);
  if (r.rows[0].c !== expected) fail(`invariante falhou: ${label}`);
  console.log("✓ " + label);
}

// 5) Resumo do funil
const funnel = await db.query(
  `select pipeline_stage, count(*)::int as c from companies group by pipeline_stage order by 1;`,
);
console.log(
  "\nFunil:",
  funnel.rows.map((x) => `${x.pipeline_stage}=${x.c}`).join("  "),
);

console.log("\n✅ Banco validado com sucesso (migrations + seed + invariantes).");
process.exit(0);
