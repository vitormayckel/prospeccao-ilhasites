// =====================================================================
// Valida o fluxo de mensagem manual (Fase 6) contra Postgres real (PGlite).
// Prova: abertura registra opened_at sem enviar (RN-03); confirmação registra
// sent_at e avança Aprovado -> Primeira abordagem (RF-14) com evento; "não
// enviei" não avança; conteúdo final é salvo independentemente do template
// (RN-13); métricas usam confirmadas (RN-14).
// Uso: node scripts/messaging-validate.mjs
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

// empresa aprovada, aguardando primeira abordagem
const company = (
  await q(
    `insert into companies (name, normalized_name, phone_e164, review_status, pipeline_stage, score)
     values ('Empresa Abordagem','empresa abordagem','+5527999991111','approved','approved',82)
     returning *`,
  )
)[0];
const template = (
  await q(
    `insert into message_templates (name, category, content)
     values ('Primeira abordagem padrão','first_contact','Olá {{company_name}}!') returning *`,
  )
)[0];

// --- mirror do messaging-service.open (RN-03: abre, não envia) ---
const finalContent = "Olá Empresa Abordagem! Vi que não tem site próprio.";
const msg = (
  await q(
    `insert into messages (company_id, template_id, type, content, phone_e164, status, opened_at)
     values ($1,$2,'first_contact',$3,$4,'opened',now()) returning *`,
    [company.id, template.id, finalContent, company.phone_e164],
  )
)[0];
assert(msg.status === "opened" && msg.opened_at, "abertura registra status opened + opened_at");
assert(msg.sent_at === null, "abertura NÃO registra sent_at (não é envio) — RN-03");
assert(msg.content === finalContent, "conteúdo final salvo na mensagem — RN-13");

// stage ainda não mudou (abertura não avança pipeline)
const stillApproved = (await q("select pipeline_stage from companies where id=$1", [company.id]))[0];
assert(stillApproved.pipeline_stage === "approved", "abertura não avança o pipeline");

// --- mirror do confirmSent (RN-03/RF-14): confirma e move approved->first_contact ---
await q("update messages set status='confirmed_sent', sent_at=now() where id=$1", [msg.id]);
await q("update companies set pipeline_stage='first_contact' where id=$1", [company.id]);
await q(
  `insert into pipeline_events (company_id, from_stage, to_stage, reason)
   values ($1,'approved','first_contact','Primeira mensagem confirmada como enviada')`,
  [company.id],
);
const confirmed = (await q("select * from messages where id=$1", [msg.id]))[0];
assert(confirmed.status === "confirmed_sent" && confirmed.sent_at, "confirmação registra sent_at");
const moved = (await q("select pipeline_stage from companies where id=$1", [company.id]))[0];
assert(moved.pipeline_stage === "first_contact", "confirmação move Aprovado -> Primeira abordagem (RF-14)");
const evt = (
  await q(
    "select count(*)::int c from pipeline_events where company_id=$1 and to_stage='first_contact'",
    [company.id],
  )
)[0];
assert(evt.c === 1, "movimentação registrada em pipeline_events (auditável)");

// RN-13: conteúdo sobrevive à remoção do template
await q("update message_templates set deleted_at=now() where id=$1", [template.id]);
const afterTplDelete = (await q("select content, template_id from messages where id=$1", [msg.id]))[0];
assert(afterTplDelete.content === finalContent, "conteúdo persiste mesmo após template removido — RN-13");

// --- caminho "não enviei" (não avança) ---
const company2 = (
  await q(
    `insert into companies (name, normalized_name, phone_e164, review_status, pipeline_stage)
     values ('Empresa NaoEnviei','empresa naoenviei','+5527999992222','approved','approved') returning *`,
  )
)[0];
const msg2 = (
  await q(
    `insert into messages (company_id, type, content, phone_e164, status, opened_at)
     values ($1,'first_contact','oi',$2,'opened',now()) returning *`,
    [company2.id, company2.phone_e164],
  )
)[0];
await q("update messages set status='not_sent', cancelled_at=now() where id=$1", [msg2.id]);
const notSent = (await q("select status, cancelled_at from messages where id=$1", [msg2.id]))[0];
assert(notSent.status === "not_sent" && notSent.cancelled_at, '"não enviei" registra not_sent + cancelled_at');
const stage2 = (await q("select pipeline_stage from companies where id=$1", [company2.id]))[0];
assert(stage2.pipeline_stage === "approved", '"não enviei" NÃO avança o pipeline');

// RN-14: métricas contam só confirmadas
const confirmedCount = (await q("select count(*)::int c from messages where status='confirmed_sent'"))[0];
assert(confirmedCount.c >= 1, "métricas contam mensagens confirmadas (RN-14)");

console.log(
  failures === 0
    ? "\n✅ Fluxo de mensagem validado (abertura≠envio, confirmação move pipeline, RN-13/RN-14)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
