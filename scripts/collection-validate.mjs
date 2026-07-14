// =====================================================================
// Valida o pipeline de coleta/deduplicação (Fase 4) contra Postgres real
// embutido (PGlite/WASM). Espelha o SQL de collection-repository/service
// para provar semântica de dedup (RF-06), idempotência (RF-03), limite
// diário (RN-10), proveniência (RN-09) e suppression (LGPD).
// Uso: node scripts/collection-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const seedPath = join(__dirname, "..", "supabase", "seed.sql");

const NAME_SIMILARITY_THRESHOLD = 0.55;
let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("✓ " + msg);
  else {
    console.error("✗ " + msg);
    failures++;
  }
}

const db = new PGlite({ extensions: { pg_trgm } });
async function q(text, params = []) {
  return (await db.query(text, params)).rows;
}

// ---- setup: migrations + seed ---------------------------------------------
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await db.exec(readFileSync(seedPath, "utf8"));
console.log("✓ schema + seed carregados");

// ---- dedup/persist mirror (mesmo SQL dos repositories) --------------------
async function isSuppressed(phoneE164, domain) {
  if (!phoneE164 && !domain) return false;
  const rows = await q(
    `select 1 from suppression_list
     where (phone_e164 is not null and phone_e164 = $1)
        or (normalized_domain is not null and normalized_domain = $2) limit 1`,
    [phoneE164, domain],
  );
  return rows.length > 0;
}

async function findExact(c) {
  if (c.externalId) {
    const r = await q(
      `select c.* from companies c join company_sources s on s.company_id = c.id
       where s.provider = $1 and s.external_id = $2 and c.deleted_at is null limit 1`,
      [c.provider, c.externalId],
    );
    if (r[0]) return r[0];
  }
  if (c.phoneE164) {
    const r = await q(
      "select * from companies where phone_e164 = $1 and deleted_at is null limit 1",
      [c.phoneE164],
    );
    if (r[0]) return r[0];
  }
  if (c.normalizedDomain) {
    const r = await q(
      "select * from companies where normalized_domain = $1 and deleted_at is null limit 1",
      [c.normalizedDomain],
    );
    if (r[0]) return r[0];
  }
  return null;
}

async function findSimilar(normalizedName, city) {
  const r = await q(
    `select c.*, similarity(c.normalized_name, $1) as similarity from companies c
     where c.deleted_at is null
       and ($2::text is null or lower(c.city) = lower($2))
       and similarity(c.normalized_name, $1) > $3
     order by similarity desc limit 1`,
    [normalizedName, city, NAME_SIMILARITY_THRESHOLD],
  );
  return r[0] ?? null;
}

async function upsertSource(companyId, c) {
  if (c.externalId) {
    const ex = await q(
      "select * from company_sources where company_id=$1 and provider=$2 and external_id=$3 limit 1",
      [companyId, c.provider, c.externalId],
    );
    if (ex[0]) {
      await q("update company_sources set last_seen_at=now() where id=$1", [ex[0].id]);
      return ex[0].id;
    }
  }
  const r = await q(
    `insert into company_sources (company_id, provider, external_id, source_url, raw_payload)
     values ($1,$2,$3,$4,$5) returning id`,
    [companyId, c.provider, c.externalId, c.sourceUrl ?? null, {}],
  );
  return r[0].id;
}

/** Retorna "new" | "duplicate" | "suppressed". */
async function classifyAndPersist(c, runId, limitReached) {
  if (await isSuppressed(c.phoneE164, c.normalizedDomain)) return "suppressed";
  const exact = await findExact(c);
  if (exact) {
    await upsertSource(exact.id, c);
    await q("update companies set updated_at=now() where id=$1", [exact.id]);
    return "duplicate";
  }
  if (limitReached) return "limit";
  const similar = await findSimilar(c.normalizedName, c.city);
  const inserted = await q(
    `insert into companies (name, normalized_name, phone_e164, normalized_domain, city, state,
       review_status, pipeline_stage, source_run_id)
     values ($1,$2,$3,$4,$5,$6,'pending_analysis','new',$7) returning id`,
    [c.name, c.normalizedName, c.phoneE164, c.normalizedDomain, c.city, c.state, runId],
  );
  await upsertSource(inserted[0].id, c);
  if (similar) {
    await q("insert into company_notes (company_id, content) values ($1,$2)", [
      inserted[0].id,
      `Possível duplicata de "${similar.name}".`,
    ]);
  }
  return "new";
}

async function runBatch(candidates, dailyLimit) {
  const run = (
    await q(
      `insert into search_runs (idempotency_key, trigger_type, status, started_at)
       values ($1,'manual','running',now()) returning id`,
      [`test:${Math.random()}`],
    )
  )[0];
  let neu = 0, dup = 0, sup = 0;
  for (const c of candidates) {
    const res = await classifyAndPersist(c, run.id, neu >= dailyLimit);
    if (res === "new") neu++;
    else if (res === "duplicate") dup++;
    else if (res === "suppressed") sup++;
  }
  await q("update search_runs set status='completed', new_companies=$2, duplicates=$3 where id=$1", [
    run.id, neu, dup,
  ]);
  return { neu, dup, sup };
}

// ---- cenários --------------------------------------------------------------
const before = (await q("select count(*)::int c from companies"))[0].c;

// pega uma empresa semeada com telefone para testar dedup por telefone
const seeded = (
  await q("select * from companies where phone_e164 is not null and deleted_at is null limit 1")
)[0];
assert(!!seeded, "existe empresa semeada com telefone para dedup");

const brandNew = {
  provider: "fixture", externalId: "fixture:test-001", name: "Alpha Servicos Teste",
  normalizedName: "alpha servicos teste", phoneE164: "+5527911110001",
  normalizedDomain: "alphateste.com.br", city: "Vitoria", state: "ES", sourceUrl: null,
};
const dupByPhone = {
  provider: "fixture", externalId: "fixture:test-dupphone", name: "Nome Diferente SA",
  normalizedName: "nome diferente sa", phoneE164: seeded.phone_e164,
  normalizedDomain: null, city: "Vitoria", state: "ES", sourceUrl: null,
};
const similarName = {
  provider: "fixture", externalId: "fixture:test-similar", name: seeded.name + " Filial",
  normalizedName: seeded.normalized_name, phoneE164: "+5527911119999",
  normalizedDomain: "outrodominio.com.br", city: seeded.city, state: seeded.state, sourceUrl: null,
};

// suppression: bloqueia um telefone
await q("insert into suppression_list (phone_e164, reason) values ($1,'teste')", ["+5527900000000"]);
const suppressed = {
  provider: "fixture", externalId: "fixture:test-sup", name: "Bloqueada LGPD",
  normalizedName: "bloqueada lgpd", phoneE164: "+5527900000000",
  normalizedDomain: null, city: "Vitoria", state: "ES", sourceUrl: null,
};

const r1 = await runBatch([brandNew, dupByPhone, similarName, suppressed], 50);
assert(r1.neu === 2, `1ª execução: 2 novas (brandNew + similarName incerto) — obtido ${r1.neu}`);
assert(r1.dup === 1, `1ª execução: 1 duplicada por telefone — obtido ${r1.dup}`);
assert(r1.sup === 1, `1ª execução: 1 bloqueada por suppression — obtido ${r1.sup}`);

const afterFirst = (await q("select count(*)::int c from companies"))[0].c;
assert(afterFirst === before + 2, `2 empresas inseridas (${before} -> ${afterFirst})`);

// nota de duplicata incerta criada
const note = (
  await q("select count(*)::int c from company_notes where content like 'Possível duplicata%'")
)[0].c;
assert(note >= 1, "match incerto (trigram) gerou nota de revisão");

// idempotência: reexecutar o mesmo lote não cria novas empresas
const r2 = await runBatch([brandNew, dupByPhone, similarName, suppressed], 50);
assert(r2.neu === 0, `2ª execução idempotente: 0 novas — obtido ${r2.neu}`);
const afterSecond = (await q("select count(*)::int c from companies"))[0].c;
assert(afterSecond === afterFirst, `contagem estável após reexecução (${afterSecond})`);

// proveniência preservada: brandNew tem 1 fonte, similarName reusou external_id
const src = (
  await q(
    "select count(*)::int c from company_sources where external_id = 'fixture:test-001'",
  )
)[0].c;
assert(src === 1, `proveniência: 1 fonte para brandNew (sem duplicar) — obtido ${src}`);

// limite diário: 3 candidatos novos, limite 2 → só 2 inseridos
const many = [1, 2, 3].map((i) => ({
  provider: "fixture", externalId: `fixture:limit-${i}`, name: `Limite Teste ${i}`,
  normalizedName: `limite teste ${i}`, phoneE164: `+552791234000${i}`,
  normalizedDomain: `limite${i}.com.br`, city: "Serra", state: "ES", sourceUrl: null,
}));
const r3 = await runBatch(many, 2);
assert(r3.neu === 2, `limite diário respeitado: 2 de 3 inseridas — obtido ${r3.neu}`);

// novas empresas entram como pending_analysis / stage new (só as inseridas no teste)
const staged = (
  await q(
    `select count(*)::int c from companies
     where (name = 'Alpha Servicos Teste' or name like 'Limite Teste%')
       and (review_status <> 'pending_analysis' or pipeline_stage <> 'new')`,
  )
)[0].c;
assert(staged === 0, "novas empresas coletadas entram como pending_analysis + stage new");

console.log(
  failures === 0
    ? "\n✅ Pipeline de coleta validado (dedup, idempotência, limite, suppression, proveniência)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
