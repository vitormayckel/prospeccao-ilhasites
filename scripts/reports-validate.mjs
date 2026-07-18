// =====================================================================
// Valida as queries da página Relatórios (Sprint 4) e as colunas da
// migration 0006 contra o schema real (migrations + seed) em PGlite.
// Espelha a SQL de reports-repository.ts. Uso: node scripts/reports-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const seedPath = join(__dirname, "..", "supabase", "seed.sql");

function fail(m) {
  console.error("✗ " + m);
  process.exit(1);
}
const ok = (m) => console.log("✓ " + m);

const db = new PGlite({ extensions: { pg_trgm } });
const q = (t, p = []) => db.query(t, p).then((r) => r.rows);

for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort())
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
await db.exec(readFileSync(seedPath, "utf8"));
ok("schema + seed aplicados (inclui migration 0006)");

// Colunas da 0006 existem e têm o default esperado.
const cols = await q(
  `select column_name, column_default from information_schema.columns
    where table_name = 'companies'
      and column_name in ('approach_channel','contact_role','next_action_status')`,
);
if (cols.length !== 3) fail("colunas da 0006 ausentes: " + cols.length);
const chan = cols.find((c) => c.column_name === "approach_channel");
if (!chan || !String(chan.column_default).includes("whatsapp"))
  fail("approach_channel deveria ter default 'whatsapp'");
ok("colunas 0006 presentes (approach_channel default whatsapp; contact_role, next_action_status)");

const APPROACHED = "('first_contact','follow_up','negotiation','client','lost')";
const REPLIED = "('replied','commercial_prepared','commercial_sent','follow_up_scheduled','closed')";

// Coleta (7 dias)
const [col] = await q(
  `select
     (select count(*)::int from companies where deleted_at is null and created_at >= now() - interval '7 days') as found,
     (select count(distinct company_id)::int from ai_analyses where status='completed' and created_at >= now() - interval '7 days') as analyzed,
     (select count(*)::int from company_decisions where decision='approved' and created_at >= now() - interval '7 days') as approved,
     (select count(*)::int from company_decisions where decision='rejected' and created_at >= now() - interval '7 days') as discarded`,
);
ok(`Coleta: found=${col.found} analyzed=${col.analyzed} approved=${col.approved} discarded=${col.discarded}`);

// Operação (7 dias) — referencia approach_channel (a coluna que faltava em prod)
const [op] = await q(
  `select
     (select count(*)::int from companies where deleted_at is null and approach_channel='whatsapp' and pipeline_stage in ${APPROACHED} and updated_at >= now() - interval '7 days') as whatsapp,
     (select count(*)::int from companies where deleted_at is null and approach_channel='instagram' and pipeline_stage in ${APPROACHED} and updated_at >= now() - interval '7 days') as instagram,
     (select count(*)::int from follow_ups where deleted_at is null and created_at >= now() - interval '7 days') as followups,
     (select count(*)::int from companies where deleted_at is null and contact_stage in ${REPLIED} and updated_at >= now() - interval '7 days') as replies`,
);
ok(`Operação: whatsapp=${op.whatsapp} instagram=${op.instagram} followups=${op.followups} replies=${op.replies}`);

// Conversão — referencia contact_role
const [conv] = await q(
  `select
     (select count(*)::int from companies where deleted_at is null and pipeline_stage in ${APPROACHED}) as approached,
     (select count(*)::int from companies where deleted_at is null and contact_stage in ${REPLIED}) as replied,
     (select count(*)::int from companies where deleted_at is null and contact_role in ('owner','partner','manager')) as decisionmaker,
     (select count(*)::int from companies where deleted_at is null and pipeline_stage in ('negotiation','client')) as proposal,
     (select count(*)::int from companies where deleted_at is null and pipeline_stage='client') as sale`,
);
if (conv.approached < conv.sale) fail("funil inconsistente (venda > abordadas)");
ok(`Conversão: abordadas=${conv.approached} responderam=${conv.replied} decisor=${conv.decisionmaker} proposta=${conv.proposal} venda=${conv.sale}`);

// Inteligência — segmento, cidade, canal, estágio principal
const seg = await q(
  `select primary_category as label, count(*)::int as value from companies
     where deleted_at is null and primary_category is not null and contact_stage in ${REPLIED}
     group by primary_category order by value desc, label asc limit 1`,
);
const stage = await q(
  `select pipeline_stage::text as label, count(*)::int as value from companies
     where deleted_at is null group by pipeline_stage order by value desc, label asc limit 1`,
);
const channels = await q(
  `select approach_channel as channel,
          count(*) filter (where pipeline_stage in ${APPROACHED})::int as approached,
          count(*) filter (where pipeline_stage='client')::int as sales
     from companies where deleted_at is null group by approach_channel`,
);
ok(`Inteligência: segmento=${seg[0]?.label ?? "—"} estágio=${stage[0]?.label ?? "—"} canais=${channels.length}`);

// audit_events aceita as ações de mudança de campo (usadas pelo Timeline)
await q(
  `insert into audit_events (entity_type, entity_id, action, metadata)
   values ('company', (select id from companies limit 1), 'approach_channel_changed', $1)`,
  [JSON.stringify({ from: "whatsapp", to: "instagram" })],
);
const audit = await q(
  `select * from audit_events where entity_type='company' and action='approach_channel_changed'`,
);
if (audit.length !== 1) fail("audit_events não gravou a mudança de canal");
ok("audit_events registra mudança de campo (base do Timeline)");

console.log("\n✓ Relatórios + migration 0006 validados contra o schema real.");
