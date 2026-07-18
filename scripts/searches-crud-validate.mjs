// =====================================================================
// Valida a SQL das novas operações de perfil de pesquisa (Sprint §1)
// contra o schema real (migrations + seed) em PGlite — sem tocar produção.
// Espelha exatamente a SQL de search-profiles-repository.ts.
// Uso: node scripts/searches-crud-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const seedPath = join(__dirname, "..", "supabase", "seed.sql");

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}
function ok(msg) {
  console.log("✓ " + msg);
}

const db = new PGlite({ extensions: { pg_trgm } });
const q = (text, params = []) => db.query(text, params).then((r) => r.rows);

// Schema + seed reais
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await db.exec(readFileSync(seedPath, "utf8"));
ok("schema + seed aplicados");

// ---- list(): agregação de cidades + categorias -----------------------
const listSql = `select sp.*,
    coalesce(array_agg(distinct l.city) filter (where l.city is not null), '{}') as cities,
    coalesce((select array_agg(c.label order by c.label)
        from search_profile_categories c
        where c.search_profile_id = sp.id and c.active), '{}') as categories,
    (select count(*)::int from search_profile_categories x
       where x.search_profile_id = sp.id and x.active) as category_count,
    r.finished_at as last_run_finished_at,
    r.status as last_run_status,
    r.results_seen as last_run_results_seen,
    r.new_companies as last_run_new_companies,
    r.duplicates as last_run_duplicates,
    r.failed_items as last_run_failed_items
  from search_profiles sp
  left join search_profile_locations l on l.search_profile_id = sp.id
  left join lateral (
    select finished_at, status, results_seen, new_companies, duplicates, failed_items
      from search_runs
      where search_profile_id = sp.id and status in ('completed', 'partial')
      order by created_at desc limit 1
  ) r on true
  where sp.deleted_at is null
  group by sp.id, r.finished_at, r.status, r.results_seen,
           r.new_companies, r.duplicates, r.failed_items
  order by sp.created_at desc`;

let list = await q(listSql);
if (list.length === 0) fail("seed não tem perfis para validar");
const base = list[0];
if (!Array.isArray(base.categories)) fail("categories não é array");
if (base.categories.length !== base.category_count)
  fail(`categories (${base.categories.length}) != category_count (${base.category_count})`);
ok(`list() agrega categorias: "${base.name}" -> [${base.categories.join(", ")}]`);
const baseCount = list.length;

// ---- duplicate(): getDetail -> create clone --------------------------
const [prof] = await q("select * from search_profiles where id = $1 and deleted_at is null", [base.id]);
const locs = await q("select * from search_profile_locations where search_profile_id = $1", [base.id]);
const cats = await q("select * from search_profile_categories where search_profile_id = $1", [base.id]);

const [clone] = await q(
  `insert into search_profiles
     (name, status, weekdays, run_time, timezone, daily_limit, radius_meters, min_rating)
   values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
  [`Cópia de ${prof.name}`.slice(0, 160), "paused", prof.weekdays, prof.run_time,
   prof.timezone, prof.daily_limit, prof.radius_meters, prof.min_rating],
);
for (const l of locs)
  await q(`insert into search_profile_locations (search_profile_id, city, state, country_code) values ($1,$2,$3,$4)`,
    [clone.id, l.city, l.state, l.country_code]);
for (const c of cats)
  await q(`insert into search_profile_categories (search_profile_id, label, provider_category) values ($1,$2,$3)`,
    [clone.id, c.label, c.provider_category]);

if (clone.status !== "paused") fail("duplicata deveria nascer pausada");
if (!clone.name.startsWith("Cópia de ")) fail("nome da duplicata incorreto");
const cloneLocs = await q("select count(*)::int c from search_profile_locations where search_profile_id=$1", [clone.id]);
const cloneCats = await q("select count(*)::int c from search_profile_categories where search_profile_id=$1", [clone.id]);
if (cloneLocs[0].c !== locs.length) fail("duplicata perdeu localidades");
if (cloneCats[0].c !== cats.length) fail("duplicata perdeu categorias");
list = await q(listSql);
if (list.length !== baseCount + 1) fail("duplicata não apareceu no list()");
ok(`duplicate() clonou "${clone.name}" (pausada, ${cloneLocs[0].c} loc, ${cloneCats[0].c} cat)`);

// ---- update(): set dinâmico + substituição de cidades/categorias -----
await q(
  `update search_profiles set name = $1, run_time = $2, daily_limit = $3, weekdays = $4, updated_at = now()
   where id = $5 and deleted_at is null`,
  ["Nome Editado", "09:30", 99, [1, 3, 5], clone.id],
);
await q("delete from search_profile_locations where search_profile_id = $1", [clone.id]);
await q(`insert into search_profile_locations (search_profile_id, city, state, country_code) values ($1,$2,$3,$4)`,
  [clone.id, "Guarapari", "ES", "BR"]);
await q("delete from search_profile_categories where search_profile_id = $1", [clone.id]);
await q(`insert into search_profile_categories (search_profile_id, label, provider_category) values ($1,$2,$3)`,
  [clone.id, "Odontologia", null]);

const [chk] = await q(`select name, run_time, daily_limit, weekdays from search_profiles where id=$1`, [clone.id]);
if (chk.name !== "Nome Editado" || chk.daily_limit !== 99) fail("update não persistiu campos");
if (String(chk.run_time).slice(0, 5) !== "09:30") fail("update não mudou horário");
const editedCities = await q("select city from search_profile_locations where search_profile_id=$1", [clone.id]);
if (editedCities.length !== 1 || editedCities[0].city !== "Guarapari") fail("update não substituiu cidades");
ok(`update() editou campos + substituiu cidade -> Guarapari, limite 99, 09:30, dias [1,3,5]`);

// ---- softDelete(): deleted_at + some do list() -----------------------
await q("update search_profiles set deleted_at = now(), updated_at = now() where id = $1", [clone.id]);
list = await q(listSql);
if (list.length !== baseCount) fail("perfil excluído ainda aparece no list()");
const [stillThere] = await q("select deleted_at from search_profiles where id=$1", [clone.id]);
if (!stillThere.deleted_at) fail("softDelete não marcou deleted_at");
ok("softDelete() removeu do list() preservando a linha (histórico intacto)");

// ---- setStatus(): pausar/ativar (idempotência do toggle) -------------
const [seedProf] = await q("select id, status from search_profiles where deleted_at is null limit 1");
const flipped = seedProf.status === "active" ? "paused" : "active";
await q("update search_profiles set status=$1, updated_at=now() where id=$2", [flipped, seedProf.id]);
let [s] = await q("select status from search_profiles where id=$1", [seedProf.id]);
if (s.status !== flipped) fail("toggle não alterou status");
await q("update search_profiles set status=$1, updated_at=now() where id=$2", [seedProf.status, seedProf.id]);
[s] = await q("select status from search_profiles where id=$1", [seedProf.id]);
if (s.status !== seedProf.status) fail("toggle de volta falhou");
ok(`setStatus() alterna ${seedProf.status} <-> ${flipped} e volta (net-zero)`);

console.log("\n✓ Todas as operações de perfil (§1) validadas contra o schema real.");
