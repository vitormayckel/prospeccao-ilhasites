// =====================================================================
// Valida as correções de deduplicação (domínio social, ordem de prioridade,
// UF em sigla) contra Postgres real (PGlite) e contra o código-fonte.
// Uso: node scripts/dedup-validate.mjs
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const assert = (c, m) => {
  if (c) console.log("✓ " + m);
  else {
    console.error("✗ " + m);
    failures++;
  }
};

// ---------------------------------------------------------------------
// 1. Domínios sociais nunca são identidade
// ---------------------------------------------------------------------
const norm = readFileSync(join(__dirname, "..", "src/server/services/normalization.ts"), "utf8");

const SOCIAL_IN_CODE = [
  "instagram.com", "facebook.com", "linktr.ee", "wa.me", "tiktok.com",
  "youtube.com", "linkedin.com", "bit.ly", "business.site",
];
for (const d of SOCIAL_IN_CODE) {
  assert(norm.includes(`"${d}"`), `"${d}" está na lista de domínios não-identidade`);
}
assert(norm.includes("export function isSocialDomain"), "isSocialDomain exportada");
assert(norm.includes("export function normalizeOwnDomain"), "normalizeOwnDomain exportada");
assert(norm.includes("export function normalizeUf"), "normalizeUf exportada");

// ---------------------------------------------------------------------
// 2. Ambos os caminhos de dedup usam domínio PRÓPRIO
// ---------------------------------------------------------------------
for (const f of [
  "src/server/services/job-runner.ts",
  "src/server/services/collection-service.ts",
]) {
  const body = readFileSync(join(__dirname, "..", f), "utf8");
  const nome = f.split("/").pop();
  assert(
    body.includes("normalizeOwnDomain(result.website)"),
    `${nome} usa normalizeOwnDomain (não normalizeDomain) como chave`,
  );
  assert(
    !/normalizedDomain:\s*normalizeDomain\(/.test(body),
    `${nome} não usa mais normalizeDomain como identidade`,
  );
  assert(body.includes("isSocialDomain"), `${nome} verifica domínio social antes de fundir`);
  assert(
    body.includes("normalizeUf(result.state)"),
    `${nome} normaliza a UF para sigla`,
  );
}

// ---------------------------------------------------------------------
// 3. Ordem de prioridade: place ID -> telefone -> domínio próprio -> nome
// ---------------------------------------------------------------------
const runner = readFileSync(join(__dirname, "..", "src/server/services/job-runner.ts"), "utf8");
const iPlace = runner.indexOf("findByProviderExternalId");
const iPhone = runner.indexOf("findByPhone");
const iDomain = runner.indexOf("findByDomain");
const iName = runner.indexOf("findSimilarByName");
assert(iPlace > 0 && iPlace < iPhone, "1º Place ID vem antes do telefone");
assert(iPhone < iDomain, "2º telefone vem antes do domínio");
assert(iDomain < iName, "3º domínio vem antes de nome+cidade");
assert(
  runner.includes('reason = "mesmo_dominio_proprio"'),
  "motivo do match por domínio explicita que é domínio próprio",
);

// 3b. Telefone divergente veta o match por domínio (filiais de rede)
for (const f of ['src/server/services/job-runner.ts','src/server/services/collection-service.ts']) {
  const body = readFileSync(join(__dirname, '..', f), 'utf8');
  assert(
    body.includes('telefonesConflitam'),
    f.split('/').pop() + ': telefone divergente veta fusão por domínio',
  );
}

// ---------------------------------------------------------------------
// 4. Provider devolve UF em sigla
// ---------------------------------------------------------------------
const prov = readFileSync(
  join(__dirname, "..", "src/server/providers/places/google-places-provider.ts"),
  "utf8",
);
assert(prov.includes("componentShortByType"), "provider extrai a forma curta da UF");
assert(
  /state = normalizeUf\(/.test(prov),
  "provider normaliza a UF antes de devolver",
);

// ---------------------------------------------------------------------
// 5. Contadores de qualificação são persistidos
// ---------------------------------------------------------------------
assert(
  (runner.match(/setQualificationCounters/g) ?? []).length >= 3,
  "contadores de qualificação gravados em ANALYZE, QUALIFY e no encerramento",
);

// ---------------------------------------------------------------------
// 6. Índice único de domínio foi removido (migration 0009)
// ---------------------------------------------------------------------
const mig = readFileSync(
  join(__dirname, "..", "supabase/migrations/0009_dedup_social_domain.sql"),
  "utf8",
);
assert(mig.includes("drop index if exists uq_companies_domain_active"), "0009 remove o índice único de domínio");
assert(mig.includes("create index if not exists idx_companies_domain_active"), "0009 mantém índice comum para a consulta");

// ---------------------------------------------------------------------
// 7. Comportamento no banco: domínio repetido é ACEITO, telefone não
// ---------------------------------------------------------------------
const db = new PGlite({ extensions: { pg_trgm } });
const q = async (t, p = []) => (await db.query(t, p)).rows;
for (const f of readdirSync(join(__dirname, "..", "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(readFileSync(join(__dirname, "..", "supabase/migrations", f), "utf8"));
}
console.log("✓ schema carregado (incluindo 0009)");

const mk = (name, domain, phone) =>
  q(
    `insert into companies (name, normalized_name, city, state, normalized_domain, phone_e164,
       review_status, pipeline_stage)
     values ($1,$2,'Vitória','ES',$3,$4,'pending_analysis','new') returning id`,
    [name, name.toLowerCase(), domain, phone],
  );

await mk("Dentista A", "clinicaa.com.br", "+5527900000001");
let sharedOk = true;
try {
  await mk("Dentista B", "clinicaa.com.br", "+5527900000002");
} catch {
  sharedOk = false;
}
assert(sharedOk, "duas empresas podem compartilhar domínio (rede/franquia não é bloqueada)");

let phoneBlocked = false;
try {
  await mk("Dentista C", "outra.com.br", "+5527900000001");
} catch {
  phoneBlocked = true;
}
assert(phoneBlocked, "telefone duplicado continua bloqueado (identidade forte)");

// ---------------------------------------------------------------------
// 7b. Critério do telefone documentado como decisão de negócio
// ---------------------------------------------------------------------
const doc = readFileSync(join(__dirname, "..", "docs/decisoes-deduplicacao.md"), "utf8");
for (const trecho of [
  "telefone idêntico significa a mesma empresa",
  "domínio de rede social nunca identifica uma empresa",
  "telefone divergente veta a fusão por domínio",
]) {
  assert(doc.includes(trecho), `decisão documentada: "${trecho}"`);
}
assert(
  /Por que aceitamos esse custo/.test(doc),
  "documento explicita o custo aceito na fusão por telefone",
);

const total = (await q("select count(*)::int as c from companies where city='Vitória' and normalized_domain='clinicaa.com.br'"))[0];
assert(total.c === 2, "as duas empresas de domínio compartilhado foram preservadas");

// place ID continua único por provedor
const c1 = (await mk("Dentista D", null, "+5527900000003"))[0];
const c2 = (await mk("Dentista E", null, "+5527900000004"))[0];
await q(
  "insert into company_sources (company_id, provider, external_id) values ($1,'google_places','PLACE_X')",
  [c1.id],
);
let placeBlocked = false;
try {
  await q(
    "insert into company_sources (company_id, provider, external_id) values ($1,'google_places','PLACE_X')",
    [c2.id],
  );
} catch {
  placeBlocked = true;
}
assert(placeBlocked, "mesmo place ID não pode pertencer a duas empresas");

console.log(
  failures === 0
    ? "\n✅ Deduplicação validada (rede social não é identidade, prioridade correta, UF em sigla)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
