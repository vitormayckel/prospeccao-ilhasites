// =====================================================================
// Valida a PÁGINA DE DETALHE da oportunidade contra o repository real.
//
// O erro que motivou esta suíte foi `commercial_factors.map is not a
// function`: a coluna é jsonb e guardava um ESCALAR string, mas o tipo do
// domínio promete um array. Um campo opcional derrubava a página inteira.
//
// Uso: npm run opportunity:detail:validate
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { createCompaniesRepository } from "@/server/repositories/companies-repository";
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
const q = async (t, p = []) => (await pg.query(t, p)).rows;
console.log("✓ schema + seed carregados");

await q("delete from companies");

const FATORES = [
  { code: "site_quality", label: "Site atual de baixa qualidade", effect: "+" },
  { code: "rating", label: "Nota alta reforça reputação", effect: "+" },
];

let seqTelefone = 0;
async function criarEmpresa(nome, extra = {}) {
  // Telefone único por empresa: `uq_companies_phone` é real e repetir o mesmo
  // número faz a fixture falhar por 23505, escondendo o que se quer testar.
  seqTelefone++;
  const [c] = await q(
    `insert into companies (name, normalized_name, primary_category, phone_e164,
       city, state, review_status, pipeline_stage, commercial_score,
       website_class, commercial_scored_by)
     values ($1,$2,$3,$4,'Vitória','ES',$5,$6,$7,$8,$9) returning *`,
    [
      nome,
      nome.toLowerCase(),
      extra.categoria ?? "Clínica odontológica",
      extra.telefone === null
        ? null
        : (extra.telefone ??
          `+55279999${String(90000 + seqTelefone).slice(-5)}`),
      extra.reviewStatus ?? "pending_review",
      extra.stage ?? "analyzed",
      extra.score ?? 72,
      extra.websiteClass ?? "reasonable",
      extra.por ?? "ai",
    ],
  );
  return c;
}

/** Reproduz a gravação DEFEITUOSA: escalar string em vez de array. */
async function gravarFatoresComoEscalar(id, fatores) {
  await q("update companies set commercial_factors = to_jsonb($2::text) where id = $1", [
    id,
    JSON.stringify(fatores),
  ]);
}

/** O que a página faz com os fatores — é aqui que estourava. */
function renderizarFatores(company) {
  return company.commercial_factors.map((f) => `${f.effect} ${f.label}`);
}

// =====================================================================
section("1. Empresa com análise completa da IA");
{
  const c = await criarEmpresa("Com Analise IA");
  await q(
    `insert into ai_analyses (company_id, status, prompt_version, provider, score, potential, confidence, output, completed_at)
     values ($1,'completed','1.0','anthropic',82,'high','medium',$2::jsonb, now())`,
    [c.id, JSON.stringify({ version: "1.0", score: 82 })],
  );
  await q("update companies set commercial_factors = $2::text::jsonb where id = $1", [
    c.id,
    JSON.stringify(FATORES),
  ]);

  const d = await companies.getDetail(c.id);
  assert(d !== null, "detalhe carregou");
  assert(d.company.name === "Com Analise IA", "nome presente");
  assert(d.company.phone_e164 !== null, "telefone presente");
  assert(d.company.city === "Vitória" && d.company.state === "ES", "cidade/UF presentes");
  assert(d.company.primary_category !== null, "categoria presente");
  assert(d.company.commercial_score === 72, "score comercial presente");
  assert(d.company.website_class === "reasonable", "classificação do website presente");
  assert(d.analyses.length === 1 && d.analyses[0].status === "completed", "análise da IA presente");
  assert(Array.isArray(d.company.commercial_factors), "fatores comerciais são array");
  assert(renderizarFatores(d.company).length === 2, "fatores renderizam sem estourar");
}

// =====================================================================
section("2. Empresa do PRÉ-FILTRO, sem linha em ai_analyses");
{
  const c = await criarEmpresa("Prefiltro Sem IA", {
    por: "prefilter",
    websiteClass: "none",
    score: 88,
  });
  await q("update companies set commercial_factors = $2::text::jsonb where id = $1", [
    c.id,
    JSON.stringify([{ code: "no_own_site", label: "Sem site próprio", effect: "+" }]),
  ]);

  const d = await companies.getDetail(c.id);
  assert(d !== null, "detalhe carregou sem nenhuma ai_analysis");
  assert(d.analyses.length === 0, "nenhuma análise de IA — é o esperado");
  assert(d.company.commercial_score === 88, "score comercial existe mesmo sem IA");
  assert(d.company.commercial_scored_by === "prefilter", "origem registrada como pré-filtro");
  assert(renderizarFatores(d.company).length === 1, "fatores do pré-filtro renderizam");
}

// =====================================================================
section("3. Empresa recuperada de analysis_failed");
{
  const c = await criarEmpresa("Recuperada", { reviewStatus: "analysis_failed" });
  await q(
    `insert into ai_analyses (company_id, status, prompt_version, provider, error_message)
     values ($1,'failed','1.0','anthropic','saldo insuficiente')`,
    [c.id],
  );
  const d = await companies.getDetail(c.id);
  assert(d !== null, "detalhe carregou com análise falha");
  assert(d.analyses[0].status === "failed", "análise falha visível");
  assert(
    d.analyses[0].error_message === "saldo insuficiente",
    "motivo da falha preservado para a tela",
  );
  assert(Array.isArray(d.company.commercial_factors), "fatores continuam array");
}

// =====================================================================
section("4. Campos opcionais nulos não derrubam a página");
{
  const [c] = await q(
    `insert into companies (name, normalized_name, city, state, review_status, pipeline_stage)
     values ('Minima','minima','Vitória','ES','pending_analysis','new') returning *`,
  );
  const d = await companies.getDetail(c.id);
  assert(d !== null, "detalhe carregou com quase tudo nulo");
  assert(d.company.phone_e164 === null, "telefone nulo aceito");
  assert(d.company.commercial_score === null, "score nulo aceito");
  assert(d.company.website_class === null, "classe de site nula aceita");
  assert(
    Array.isArray(d.company.commercial_factors),
    "commercial_factors é array mesmo sem nunca ter sido classificada",
  );
  assert(renderizarFatores(d.company).length === 0, "lista vazia, sem exceção");
  assert(d.sources.length === 0 && d.notes.length === 0, "relações vazias não quebram");
}

// =====================================================================
section("5. companyId inexistente e arquivado → 404 (detalhe nulo)");
{
  const inexistente = await companies.getDetail(
    "00000000-0000-0000-0000-000000000000",
  );
  assert(inexistente === null, "id inexistente devolve null (a página chama notFound)");

  const c = await criarEmpresa("Arquivada");
  await q("update companies set deleted_at = now() where id = $1", [c.id]);
  const arquivada = await companies.getDetail(c.id);
  assert(arquivada === null, "empresa arquivada devolve null, não erro");
}

// =====================================================================
section("6. REGRESSÃO: escalar string gravado antes da correção");
{
  const c = await criarEmpresa("Legado Escalar");
  await gravarFatoresComoEscalar(c.id, FATORES);

  // Confirma que a fixture reproduz mesmo a forma defeituosa.
  const [cru] = await q(
    "select jsonb_typeof(commercial_factors) as tipo from companies where id = $1",
    [c.id],
  );
  assert(cru.tipo === "string", `fixture grava um escalar string (jsonb_typeof=${cru.tipo})`);

  const d = await companies.getDetail(c.id);
  assert(d !== null, "detalhe carrega mesmo com a forma antiga");
  assert(
    Array.isArray(d.company.commercial_factors),
    "leitura reconcilia o escalar em array",
  );
  assert(
    renderizarFatores(d.company).length === 2,
    "os fatores antigos continuam legíveis, sem exceção",
  );

  // E a lista, que também expõe a coluna.
  const lista = await companies.list({
    sort: "commercial",
    order: "desc",
    page: 1,
    pageSize: 20,
  });
  assert(
    lista.rows.every((r) => Array.isArray(r.commercial_factors)),
    "toda a listagem devolve arrays, nas duas direções",
  );
  const asc = await companies.list({
    sort: "commercial",
    order: "asc",
    page: 1,
    pageSize: 20,
  });
  assert(
    asc.rows.every((r) => Array.isArray(r.commercial_factors)),
    "idem na ordem crescente",
  );
}

// =====================================================================
section("7. Gravação nova produz ARRAY, não escalar");
{
  const c = await criarEmpresa("Gravacao Nova");
  await companies.setCommercialClassification(c.id, {
    websiteClass: "very_poor",
    commercialScore: 91,
    factors: FATORES,
    by: "ai",
  });
  const [cru] = await q(
    "select jsonb_typeof(commercial_factors) as tipo from companies where id = $1",
    [c.id],
  );
  assert(
    cru.tipo === "array",
    `setCommercialClassification grava um ARRAY (jsonb_typeof=${cru.tipo})`,
  );
  const d = await companies.getDetail(c.id);
  assert(d.company.commercial_score === 91, "score gravado");
  assert(renderizarFatores(d.company).length === 2, "fatores legíveis após gravação nova");
}

// =====================================================================
console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("✅ Detalhe da oportunidade validado (7 cenários).");
await pg.close();
