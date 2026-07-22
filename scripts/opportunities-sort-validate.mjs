// =====================================================================
// Valida a ORDENAÇÃO da fila de Oportunidades.
//
// Executa o repository REAL contra Postgres embutido (PGlite). A seta da
// interface só troca `order` na URL; quem ordena é esta consulta — então é
// aqui que a prova precisa estar.
//
// Uso: npm run opportunities:sort:validate
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { createCompaniesRepository } from "@/server/repositories/companies-repository";
import { opportunityFiltersSchema } from "@/lib/validation/company";
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

const db = {
  async query(text, params = []) {
    return normalizeRows((await pg.query(text, params)).rows);
  },
  async transaction(fn) {
    return pg.transaction(async () => fn(db));
  },
};
const companies = createCompaniesRepository(db);
console.log("✓ schema + seed carregados");

// ---------------------------------------------------------------------
// Fixture controlada: scores conhecidos + duas empresas SEM score
// ---------------------------------------------------------------------
await pg.query("delete from companies");
const SCORES = [92, 88, 81, 74, 63, 46, 31, 25];
for (const s of SCORES) {
  await pg.query(
    `insert into companies (name, normalized_name, city, state, review_status,
       pipeline_stage, commercial_score, website_class)
     values ($1,$2,'Vitória','ES','pending_review','analyzed',$3,'reasonable')`,
    [`Empresa ${s}`, `empresa ${s}`, s],
  );
}
for (const n of ["Sem Score A", "Sem Score B"]) {
  await pg.query(
    `insert into companies (name, normalized_name, city, state, review_status,
       pipeline_stage, commercial_score, website_class)
     values ($1,$2,'Vitória','ES','pending_review','analyzed',null,null)`,
    [n, n.toLowerCase()],
  );
}
console.log(`✓ fixture: ${SCORES.length} com score + 2 sem score`);

/** Passa pelo MESMO schema que a página usa, a partir de searchParams. */
const listar = (searchParams) =>
  companies.list(
    opportunityFiltersSchema.parse({ sort: "commercial", ...searchParams }),
  );

const scoresDe = (r) => r.rows.map((x) => x.commercial_score);

// =====================================================================
section("1. Decrescente — padrão, sem parâmetro de direção");
{
  const r = await listar({});
  const s = scoresDe(r);
  console.log("   ", JSON.stringify(s));
  assert(
    JSON.stringify(s.slice(0, 8)) === JSON.stringify([92, 88, 81, 74, 63, 46, 31, 25]),
    "maior para menor: 92, 88, 81, 74, 63, 46, 31, 25",
  );
  assert(
    s[8] === null && s[9] === null,
    "empresas sem score no FINAL na ordem decrescente",
  );
}

// =====================================================================
section("2. Crescente — order=asc");
{
  const r = await listar({ order: "asc" });
  const s = scoresDe(r);
  console.log("   ", JSON.stringify(s));
  assert(
    JSON.stringify(s.slice(0, 8)) === JSON.stringify([25, 31, 46, 63, 74, 81, 88, 92]),
    "menor para maior: 25, 31, 46, 63, 74, 81, 88, 92",
  );
  assert(
    s[8] === null && s[9] === null,
    "empresas sem score no FINAL também na ordem crescente",
  );
}

// =====================================================================
section("3. As duas direções produzem listas REALMENTE diferentes");
{
  const desc = scoresDe(await listar({}));
  const asc = scoresDe(await listar({ order: "asc" }));
  assert(
    JSON.stringify(desc) !== JSON.stringify(asc),
    "a lista muda de fato entre desc e asc",
  );
  assert(
    JSON.stringify(desc.slice(0, 8)) ===
      JSON.stringify([...asc.slice(0, 8)].reverse()),
    "uma é exatamente o inverso da outra (ignorando os nulos, que ficam no fim)",
  );
}

// =====================================================================
section("4. Direção é respeitada com paginação");
{
  const p1 = await listar({ order: "asc", page: 1 });
  assert(p1.page === 1, "página 1");
  assert(p1.total === 10, `total = 10 (obtido: ${p1.total})`);
  const primeiros = scoresDe(p1).slice(0, 3);
  assert(
    JSON.stringify(primeiros) === JSON.stringify([25, 31, 46]),
    `topo da crescente é o menor score (obtido: ${JSON.stringify(primeiros)})`,
  );
  const p1desc = await listar({ order: "desc", page: 1 });
  assert(
    scoresDe(p1desc)[0] === 92,
    `topo da decrescente é o maior score (obtido: ${scoresDe(p1desc)[0]})`,
  );
}

// =====================================================================
section("5. Ordenação é estável (paginação não repete nem perde linhas)");
{
  // Empates propositais: mesmo score, para expor ordenação não determinística.
  await pg.query(
    `insert into companies (name, normalized_name, city, state, review_status,
       pipeline_stage, commercial_score, website_class)
     select 'Empate '||g, 'empate '||g, 'Vitória','ES','pending_review','analyzed',50,'reasonable'
       from generate_series(1,6) g`,
  );
  const a = await listar({ pageSize: 5, page: 1 });
  const b = await listar({ pageSize: 5, page: 2 });
  const ids = [...a.rows, ...b.rows].map((r) => r.id);
  assert(
    new Set(ids).size === ids.length,
    "nenhuma empresa aparece em duas páginas",
  );
  const denovo = await listar({ pageSize: 5, page: 1 });
  assert(
    JSON.stringify(denovo.rows.map((r) => r.id)) ===
      JSON.stringify(a.rows.map((r) => r.id)),
    "mesma consulta devolve sempre a mesma ordem",
  );
}

// =====================================================================
section("6. Outros critérios continuam respeitando a direção");
{
  const asc = await listar({ sort: "name", order: "asc" });
  const desc = await listar({ sort: "name", order: "desc" });
  assert(
    asc.rows[0].normalized_name < desc.rows[0].normalized_name,
    "ordenação por nome inverte corretamente",
  );
  const recentes = await listar({ sort: "created_at", order: "desc" });
  const antigas = await listar({ sort: "created_at", order: "asc" });
  assert(
    recentes.rows[0].id !== antigas.rows[0].id,
    "ordenação por data inverte corretamente",
  );
}

// =====================================================================
console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("✅ Ordenação da fila de oportunidades validada (6 cenários).");
await pg.close();
