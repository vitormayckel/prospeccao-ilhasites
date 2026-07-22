// =====================================================================
// Valida a correção da causa raiz da falha em DEDUP (2026-07-22).
//
// Executa o job-runner REAL (src/server/services/job-runner.ts) contra um
// Postgres real embutido (PGlite), com provedor de coleta injetado. Nada de
// SQL reimplementado: o que roda aqui é o mesmo código que roda em produção.
//
// Prova:
//   1. candidato novo
//   2. empresa ATIVA já existente pelo Place ID
//   3. empresa ARQUIVADA reencontrada e restaurada (causa raiz)
//   4. conflito provider+external_id sem 23505 escapando
//   5. rollback sem empresa órfã
//   6. erro permanente encerra o job SEM retry
//   7. erro transitório agenda retry
//   8. search_run finalizado como 'failed'
//   9. duplo clique / duas criações simultâneas
//  10. paginação com mais de 20 resultados
//  10b. paginação para quando o orçamento de IA acaba
//  10c. página adiada quando a carência do token não cabe no tick
//  11. continuidade entre cidade+categoria até target_qualified
//
// Uso: npm run dedup:reactivation:validate
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { createJobRunner } from "@/server/services/job-runner";
import { createJobsRepository } from "@/server/repositories/jobs-repository";
import { createCollectionRepository } from "@/server/repositories/collection-repository";
import { createSearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
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
function section(title) {
  console.log("\n── " + title + " ──");
}

// ---------------------------------------------------------------------
// Banco + adapter (mesmo contrato de src/lib/database/pglite-adapter.ts,
// incluindo `transaction`, que é o que a etapa DEDUP exige)
// ---------------------------------------------------------------------
const pg = new PGlite({ extensions: { pg_trgm } });
await pg.waitReady;

for (const f of readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await pg.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
await pg.exec(readFileSync(seedPath, "utf8"));

function adapt(client) {
  return {
    async query(text, params = []) {
      const result = await client.query(text, params);
      return normalizeRows(result.rows);
    },
    async transaction(fn) {
      // PGlite não aninha transação: se já estamos dentro de uma, reusa.
      if (client !== pg) return fn(adapt(client));
      return pg.transaction(async (txn) => fn(adapt(txn)));
    },
  };
}
const db = adapt(pg);
const q = async (text, params = []) => (await pg.query(text, params)).rows;

console.log("✓ schema + seed carregados (migrations 0001..0012)");

// ---------------------------------------------------------------------
// Perfil de teste: 2 cidades × 2 categorias = 4 combinações
// ---------------------------------------------------------------------
const [profile] = await q(
  `insert into search_profiles (name, status, daily_limit, provider)
   values ('TESTE Dedup Reativacao', 'active', 40, 'fixture') returning *`,
);
for (const city of ["Vitória", "Vila Velha"]) {
  await q(
    `insert into search_profile_locations (search_profile_id, city, state, country_code)
     values ($1,$2,'ES','BR')`,
    [profile.id, city],
  );
}
for (const label of ["Clínica Odontológica", "Dentista"]) {
  await q(
    `insert into search_profile_categories (search_profile_id, label, active)
     values ($1,$2,true)`,
    [profile.id, label],
  );
}

// ---------------------------------------------------------------------
// Provedor injetável: cada teste define o que ele devolve
// ---------------------------------------------------------------------
let providerScript = { pages: [], calls: [] };

function place(id, overrides = {}) {
  return {
    externalId: id,
    name: overrides.name ?? `Clinica ${id}`,
    primaryCategory: "Clínica odontológica",
    phone: overrides.phone ?? null,
    website: overrides.website ?? null,
    instagram: null,
    addressLine: overrides.addressLine ?? "Rua Teste, 100",
    city: overrides.city ?? "Vitória",
    state: "ES",
    postalCode: "29000-000",
    countryCode: "BR",
    latitude: -20.3,
    longitude: -40.3,
    rating: overrides.rating ?? 4.5,
    reviewsCount: overrides.reviewsCount ?? 10,
    sourceUrl: `https://maps.google.com/?q=${id}`,
    rawPayload: { id, ...overrides.rawPayload },
  };
}

const stubProvider = {
  name: "google_places",
  async search(query) {
    providerScript.calls.push({
      city: query.city,
      term: query.category,
      pageToken: query.pageToken ?? null,
    });
    const next = providerScript.pages.shift();
    if (!next) return { results: [], estimatedCost: 0, nextPageToken: null };
    if (typeof next === "function") return next(query);
    return next;
  },
};

// Análise: marca a empresa como analisada (é o que qualifica no runner).
const stubAnalysis = {
  async analyzeCompany(companyId) {
    await q(
      `update companies set review_status = 'pending_review', score = 80,
              updated_at = now() where id = $1`,
      [companyId],
    );
    return { ok: true };
  },
};

function buildRunner(overrides = {}) {
  return createJobRunner({
    db,
    jobs: createJobsRepository(db),
    collection: createCollectionRepository(db),
    searchProfiles: createSearchProfilesRepository(db),
    analysis: overrides.analysis ?? stubAnalysis,
    resolveProvider: () => overrides.provider ?? stubProvider,
  });
}

const jobsRepo = createJobsRepository(db);

/** Limpa o estado entre cenários (o índice único exige 1 job ativo/perfil). */
async function reset() {
  await q("delete from job_candidates");
  await q("delete from job_queue");
  await q("delete from company_field_evidence");
  await q("delete from company_sources");
  await q("delete from company_notes");
  await q("delete from audit_events");
  await q("delete from companies");
  await q("delete from search_runs");
  providerScript = { pages: [], calls: [] };
}

async function createJob(target = 40, maxProviderCalls = 60) {
  const { job } = await jobsRepo.createUnique({
    jobType: "prospect_pipeline",
    searchProfileId: profile.id,
    idempotencyKey: `t:${profile.id}:${Math.random()}`,
    targetQualified: target,
    maxProviderCalls,
    maxAiCalls: 200,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    payload: { provider: "google_places" },
  });
  return job;
}

/** Roda ticks até o job encerrar ou estourar o teto de segurança. */
async function drain(runner, maxTicks = 40) {
  for (let i = 0; i < maxTicks; i++) {
    const result = await runner.runTick({ budgetMs: 4000 });
    if (!result.picked || !result.hasMoreWork) return result;
  }
  throw new Error("drain: excedeu o número máximo de ticks");
}

// =====================================================================
// 1. Candidato novo
// =====================================================================
section("1. Candidato novo");
await reset();
{
  providerScript.pages = [
    { results: [place("PLACE_NOVO_1")], estimatedCost: 0, nextPageToken: null },
  ];
  const job = await createJob(1);
  await drain(buildRunner());

  const companies = await q("select * from companies");
  const sources = await q("select * from company_sources");
  const evidence = await q("select * from company_field_evidence");
  const cand = await q("select * from job_candidates where job_id = $1", [
    job.id,
  ]);

  assert(companies.length === 1, "empresa criada");
  assert(sources.length === 1, "proveniência gravada");
  assert(evidence.length > 0, "evidência de campo gravada");
  assert(cand[0]?.stage === "new", "candidato resolvido como 'new'");
  const after = await q("select * from job_queue where id = $1", [job.id]);
  assert(after[0].count_new === 1, "count_new = 1");
}

// =====================================================================
// 2. Empresa ATIVA já existente pelo Place ID
// =====================================================================
section("2. Empresa ativa já existente pelo Place ID");
await reset();
{
  const [existing] = await q(
    `insert into companies (name, normalized_name, city, state, review_status, pipeline_stage)
     values ('Clinica Existente','clinica existente','Vitória','ES','pending_review','analyzed')
     returning *`,
  );
  await q(
    `insert into company_sources (company_id, provider, external_id)
     values ($1,'google_places','PLACE_ATIVO')`,
    [existing.id],
  );

  providerScript.pages = [
    { results: [place("PLACE_ATIVO")], estimatedCost: 0, nextPageToken: null },
  ];
  const job = await createJob(1);
  await drain(buildRunner());

  const companies = await q("select * from companies");
  const cand = await q("select * from job_candidates where job_id = $1", [
    job.id,
  ]);
  assert(companies.length === 1, "NENHUMA empresa nova criada");
  assert(cand[0]?.stage === "existing", "candidato resolvido como 'existing'");
  assert(cand[0]?.reason === "mesmo_place_id", "motivo = mesmo_place_id");
  assert(cand[0]?.company_id === existing.id, "vinculado à empresa existente");
}

// =====================================================================
// 3. CAUSA RAIZ — empresa ARQUIVADA reencontrada e restaurada
// =====================================================================
section("3. Empresa arquivada é reativada (causa raiz)");
await reset();
{
  const [archived] = await q(
    `insert into companies
       (name, normalized_name, phone_e164, city, state, review_status,
        pipeline_stage, score, deleted_at)
     values ('Nome Antigo','nome antigo','+552730294331','Vitória','ES',
             'approved','first_contact', 91, now())
     returning *`,
  );
  await q(
    `insert into company_sources (company_id, provider, external_id)
     values ($1,'google_places','PLACE_ARQUIVADO')`,
    [archived.id],
  );
  // Histórico que precisa sobreviver à reativação.
  await q(
    `insert into company_notes (company_id, content) values ($1,'nota historica')`,
    [archived.id],
  );

  providerScript.pages = [
    {
      results: [
        place("PLACE_ARQUIVADO", {
          name: "Nome Novo Coletado",
          phone: "+55 27 3029-4331",
          website: "https://exemplo.com.br",
          reviewsCount: 2937,
        }),
      ],
      estimatedCost: 0,
      nextPageToken: null,
    },
  ];
  const job = await createJob(1);
  await drain(buildRunner());

  const companies = await q("select * from companies");
  const [restored] = await q("select * from companies where id = $1", [
    archived.id,
  ]);
  const cand = await q("select * from job_candidates where job_id = $1", [
    job.id,
  ]);
  const notes = await q("select * from company_notes where company_id = $1", [
    archived.id,
  ]);
  const audit = await q(
    "select * from audit_events where entity_id = $1 and action = 'company.reactivated'",
    [archived.id],
  );
  const sources = await q("select * from company_sources");

  assert(companies.length === 1, "NENHUMA empresa duplicada foi criada");
  assert(restored.deleted_at === null, "empresa restaurada (deleted_at = null)");
  assert(restored.id === archived.id, "mesmo company_id preservado");
  assert(
    restored.name === "Nome Novo Coletado",
    "dados atualizados com a coleta mais recente",
  );
  assert(
    restored.reviews_count === 2937,
    "métricas atualizadas com a coleta mais recente",
  );
  assert(
    restored.pipeline_stage === "first_contact" && restored.score === 91,
    "campos operacionais preservados (estágio e score)",
  );
  assert(notes.length === 1, "histórico (notas) preservado");
  assert(audit.length === 1, "reativação registrada em audit_events");
  assert(
    audit[0]?.metadata?.externalId === "PLACE_ARQUIVADO",
    "auditoria registra o Place ID que motivou a reativação",
  );
  assert(sources.length === 1, "proveniência reaproveitada, não duplicada");
  assert(cand[0]?.reason === "empresa_reativada", "motivo = empresa_reativada");

  const after = await q("select * from job_queue where id = $1", [job.id]);
  assert(after[0].status === "completed", "job concluiu sem falhar");
  assert(after[0].count_new === 0, "reativação NÃO conta como nova");
  assert(after[0].count_existing === 1, "reativação conta como já existente");
}

// =====================================================================
// 4. Conflito provider+external_id (dedup casou por telefone com OUTRA)
// =====================================================================
section("4. Conflito de identidade não vira 23505");
await reset();
{
  // Empresa A detém o Place ID; empresa B tem o mesmo telefone do candidato.
  const [ownerOfPlaceId] = await q(
    `insert into companies (name, normalized_name, city, state)
     values ('Dona do PlaceID','dona do placeid','Vitória','ES') returning *`,
  );
  await q(
    `insert into company_sources (company_id, provider, external_id)
     values ($1,'google_places','PLACE_CONFLITO')`,
    [ownerOfPlaceId.id],
  );
  const [phoneTwin] = await q(
    `insert into companies (name, normalized_name, phone_e164, city, state)
     values ('Mesma Linha','mesma linha','+552733334444','Vitória','ES') returning *`,
  );

  // O candidato traz o Place ID de A e o telefone de B. O nível 1 encontra A
  // (ativa) e resolve corretamente — sem colisão.
  providerScript.pages = [
    {
      results: [place("PLACE_CONFLITO", { phone: "+55 27 3333-4444" })],
      estimatedCost: 0,
      nextPageToken: null,
    },
  ];
  const job = await createJob(1);
  await drain(buildRunner());

  const cand = await q("select * from job_candidates where job_id = $1", [
    job.id,
  ]);
  const after = await q("select * from job_queue where id = $1", [job.id]);
  const companies = await q("select * from companies");
  const [owner] = await q("select * from companies where id = $1", [
    ownerOfPlaceId.id,
  ]);
  const [twin] = await q("select * from companies where id = $1", [
    phoneTwin.id,
  ]);

  assert(after[0].status !== "failed", "job NÃO falhou por conflito");
  assert(companies.length === 2, "nenhuma empresa extra criada");
  assert(
    cand[0]?.company_id === ownerOfPlaceId.id,
    "Place ID tem precedência sobre telefone (nível 1 antes do nível 2)",
  );
  assert(cand[0]?.stage === "existing", "candidato resolvido, não descartado");
  // O telefone do candidato já pertence a OUTRA empresa ativa. Preencher a
  // lacuna violaria uq_companies_phone; o back-fill é pulado e o candidato
  // continua resolvido.
  assert(
    owner.phone_e164 === null,
    "back-fill de telefone pulado quando o número é de outra empresa ativa",
  );
  assert(
    twin.phone_e164 === "+552733334444",
    "telefone da outra empresa permanece intacto",
  );

  // A proteção de identidade do Place ID continua de pé no banco. É ela que
  // impede duas empresas de representarem o mesmo Place ID mesmo sob execução
  // concorrente (dois jobs coletando o mesmo lugar ao mesmo tempo): a segunda
  // transação recebe 23505 e é revertida inteira, sem duplicata.
  let indiceRejeitou = false;
  try {
    await q(
      `insert into company_sources (company_id, provider, external_id)
       values ($1,'google_places','PLACE_CONFLITO')`,
      [phoneTwin.id],
    );
  } catch (error) {
    indiceRejeitou = String(error.message).includes(
      "uq_company_sources_provider_ext",
    );
  }
  assert(
    indiceRejeitou,
    "uq_company_sources_provider_ext continua impedindo dois donos do mesmo Place ID",
  );
}

// =====================================================================
// 5. Rollback sem empresa órfã
// =====================================================================
section("5. Rollback não deixa empresa órfã");
await reset();
{
  // Faz a ÚLTIMA escrita do candidato falhar, depois de a empresa e a fonte
  // já terem sido inseridas — exatamente a forma da falha original.
  await pg.exec(`
    create or replace function boom_evidence() returns trigger as $$
    begin raise exception 'falha proposital de teste'; end;
    $$ language plpgsql;
    create trigger trg_boom before insert on company_field_evidence
      for each row execute function boom_evidence();
  `);

  providerScript.pages = [
    { results: [place("PLACE_ROLLBACK")], estimatedCost: 0, nextPageToken: null },
  ];
  const job = await createJob(1);
  await drain(buildRunner());

  const companies = await q("select * from companies");
  const sources = await q("select * from company_sources");
  const cand = await q("select * from job_candidates where job_id = $1", [
    job.id,
  ]);
  const after = await q("select * from job_queue where id = $1", [job.id]);

  assert(companies.length === 0, "NENHUMA empresa órfã permaneceu");
  assert(sources.length === 0, "nenhuma fonte parcial permaneceu");
  assert(cand[0]?.stage === "invalid", "candidato foi para quarentena");
  assert(
    cand[0]?.reason === "conflito_de_identidade",
    "quarentena registra o motivo",
  );
  assert(after[0].count_failed === 1, "contabilizado como falha");
  assert(
    after[0].count_new === 0,
    "count_new não contou a empresa que foi revertida",
  );

  await pg.exec("drop trigger trg_boom on company_field_evidence;");
}

// =====================================================================
// 6. Erro permanente (23505) encerra o job SEM retry
// =====================================================================
section("6. Erro permanente encerra sem retry");
await reset();
{
  const permanent = Object.assign(
    new Error('duplicate key value violates unique constraint "qualquer"'),
    { code: "23505" },
  );
  const failingProvider = {
    name: "google_places",
    async search() {
      throw permanent;
    },
  };

  const job = await createJob(5);
  await drain(buildRunner({ provider: failingProvider }));

  const [after] = await q("select * from job_queue where id = $1", [job.id]);
  assert(after.status === "failed", "job encerrado como 'failed'");
  assert(
    after.finish_reason === "erro_permanente",
    "motivo = erro_permanente (não max_attempts_reached)",
  );
  assert(
    after.attempts < after.max_attempts,
    `nenhuma tentativa desperdiçada (attempts=${after.attempts} de ${after.max_attempts})`,
  );
  assert(
    typeof after.last_error === "string" &&
      !after.last_error.includes("Não foi possível carregar"),
    "mensagem NÃO é a de falha de leitura",
  );
  assert(
    after.last_error.includes("Conflito de identidade"),
    `mensagem descreve o conflito: "${after.last_error}"`,
  );
  assert(
    !after.last_error.includes("constraint") &&
      !after.last_error.includes("duplicate key"),
    "mensagem não expõe SQL nem nome de constraint",
  );

  // ---- 8. search_run finalizado como failed -------------------------
  section("8. search_run finalizado como 'failed'");
  const [run] = await q("select * from search_runs where id = $1", [
    after.search_run_id,
  ]);
  assert(run !== undefined, "search_run foi criado");
  assert(run.status === "failed", "search_run NÃO ficou preso em 'running'");
  assert(run.finished_at !== null, "finished_at preenchido");
  assert(run.error_code === "erro_permanente", "error_code persistido");
  assert(
    typeof run.error_message === "string" && run.error_message.length > 0,
    "error_message sanitizado persistido",
  );
}

// =====================================================================
// 7. Erro transitório agenda retry
// =====================================================================
section("7. Erro transitório agenda retry");
await reset();
{
  const transientProvider = {
    name: "google_places",
    async search() {
      throw new Error("Connection terminated unexpectedly");
    },
  };

  const job = await createJob(5);
  const runner = buildRunner({ provider: transientProvider });
  const result = await runner.runTick({ budgetMs: 4000 });

  const [after] = await q("select * from job_queue where id = $1", [job.id]);
  assert(result.hasMoreWork === true, "tick sinaliza que há nova tentativa");
  assert(after.status === "queued", "job voltou para a fila");
  assert(after.attempts === 1, "tentativa consumida");
  assert(after.finish_reason === null, "não encerrado");
  const [run] = await q("select * from search_runs where id = $1", [
    after.search_run_id,
  ]);
  assert(
    run.status === "running",
    "search_run segue 'running' enquanto há retry pendente",
  );
}

// =====================================================================
// 9. Duplo clique / duas criações simultâneas
// =====================================================================
section("9. Duplo clique não cria duas execuções");
await reset();
{
  const input = () => ({
    jobType: "prospect_pipeline",
    searchProfileId: profile.id,
    idempotencyKey: `dup:${profile.id}:${Math.random()}`,
    targetQualified: 40,
    maxProviderCalls: 60,
    maxAiCalls: 200,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    payload: { provider: "google_places" },
  });

  const first = await jobsRepo.createUnique(input());
  const second = await jobsRepo.createUnique(input());

  const all = await q(
    "select * from job_queue where search_profile_id = $1 and status in ('queued','running')",
    [profile.id],
  );
  assert(first.alreadyRunning === false, "primeira criação cria a execução");
  assert(second.alreadyRunning === true, "segunda é rejeitada como duplicada");
  assert(second.job.id === first.job.id, "segunda devolve a execução ativa");
  assert(all.length === 1, "existe exatamente UMA execução ativa no banco");

  // O índice único é a defesa real: força o INSERT direto, contornando a
  // checagem prévia, e confirma que o banco recusa.
  let rejeitadoPeloBanco = false;
  try {
    await q(
      `insert into job_queue
         (job_type, search_profile_id, idempotency_key, status, phase, target_qualified)
       values ('prospect_pipeline',$1,'bypass','queued','SEARCH',40)`,
      [profile.id],
    );
  } catch (error) {
    rejeitadoPeloBanco = String(error.message).includes("uq_job_queue_active_profile");
  }
  assert(
    rejeitadoPeloBanco,
    "uq_job_queue_active_profile bloqueia a segunda execução no banco",
  );
}

// =====================================================================
// 10. Paginação com mais de 20 resultados
// =====================================================================
section("10. Paginação vai além de 20 resultados");
await reset();
{
  const pageOf = (prefix, n) =>
    Array.from({ length: n }, (_, i) => place(`${prefix}_${i}`));

  providerScript.pages = [
    { results: pageOf("P1", 20), estimatedCost: 0, nextPageToken: "TOKEN_P2" },
    { results: pageOf("P2", 20), estimatedCost: 0, nextPageToken: "TOKEN_P3" },
    { results: pageOf("P3", 20), estimatedCost: 0, nextPageToken: null },
    // Combinações seguintes ficam vazias: o foco aqui é a paginação.
    ...Array.from({ length: 6 }, () => ({
      results: [],
      estimatedCost: 0,
      nextPageToken: null,
    })),
  ];

  const job = await createJob(100);
  await drain(buildRunner(), 80);

  const [after] = await q("select * from job_queue where id = $1", [job.id]);
  const companies = await q("select count(*)::int as c from companies");

  assert(
    after.results_raw >= 60,
    `mais de uma página coletada por combinação (results_raw=${after.results_raw})`,
  );
  assert(companies[0].c >= 60, `empresas persistidas: ${companies[0].c}`);

  const paged = providerScript.calls.filter((c) => c.pageToken !== null);
  assert(paged.length === 2, "duas chamadas usaram pageToken");
  assert(
    paged[0].pageToken === "TOKEN_P2" && paged[1].pageToken === "TOKEN_P3",
    "tokens encadeados na ordem correta",
  );
  assert(
    paged.every((c) => c.city === "Vitória"),
    "paginação permaneceu na MESMA combinação cidade×categoria",
  );
  assert(
    after.cursor_page_token === null,
    "token limpo ao trocar de combinação",
  );
}

// =====================================================================
// 10b. Paginação respeita o orçamento de IA
// =====================================================================
section("10b. Paginação para quando o orçamento de IA acaba");
await reset();
{
  const pageOf = (prefix, n) =>
    Array.from({ length: n }, (_, i) => place(`${prefix}_${i}`));
  providerScript.pages = [
    { results: pageOf("Q1", 20), estimatedCost: 0, nextPageToken: "TOKEN_Q2" },
    { results: pageOf("Q2", 20), estimatedCost: 0, nextPageToken: "TOKEN_Q3" },
    ...Array.from({ length: 8 }, () => ({
      results: [],
      estimatedCost: 0,
      nextPageToken: null,
    })),
  ];

  // Meta alta (não encerra por meta) e chamadas de provedor de sobra: o único
  // limite capaz de barrar a paginação aqui é o orçamento de IA.
  const { job } = await jobsRepo.createUnique({
    jobType: "prospect_pipeline",
    searchProfileId: profile.id,
    idempotencyKey: `ia:${profile.id}:${Math.random()}`,
    targetQualified: 100,
    maxProviderCalls: 60,
    maxAiCalls: 0, // orçamento de IA zerado
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    payload: { provider: "google_places" },
  });
  await drain(buildRunner(), 80);

  const [after] = await q("select * from job_queue where id = $1", [job.id]);
  const comToken = providerScript.calls.filter((c) => c.pageToken !== null);

  assert(
    comToken.length === 0,
    `nenhuma página extra foi paga sem orçamento de IA (chamadas com token=${comToken.length})`,
  );
  assert(
    after.cursor_page_token === null,
    "cursor não guardou token para continuar",
  );
  assert(
    after.finish_reason === "limite_chamadas_ia",
    `encerrou pelo limite de IA (motivo=${after.finish_reason})`,
  );
}

// =====================================================================
// 10c. Carência do pageToken não estoura o orçamento do tick
// =====================================================================
section("10c. Página adiada quando a carência não cabe no tick");
await reset();
{
  const pageOf = (prefix, n) =>
    Array.from({ length: n }, (_, i) => place(`${prefix}_${i}`));
  providerScript.pages = [
    { results: pageOf("R1", 20), estimatedCost: 0, nextPageToken: "TOKEN_R2" },
    { results: pageOf("R2", 20), estimatedCost: 0, nextPageToken: null },
    ...Array.from({ length: 8 }, () => ({
      results: [],
      estimatedCost: 0,
      nextPageToken: null,
    })),
  ];

  const job = await createJob(100);
  const runner = buildRunner();

  // Tick curto: o orçamento não comporta a carência de 2 s do token.
  const inicio = Date.now();
  await runner.runTick({ budgetMs: 3000 });
  const duracao = Date.now() - inicio;

  const [meio] = await q("select * from job_queue where id = $1", [job.id]);
  assert(
    duracao < 3000 + 1500,
    `tick curto não estourou o orçamento (durou ${duracao}ms)`,
  );
  assert(
    meio.cursor_page_token === "TOKEN_R2",
    "token preservado no cursor para o próximo tick",
  );

  // Ticks seguintes concluem a paginação sem perder a página adiada.
  await drain(runner, 80);
  const [after] = await q("select * from job_queue where id = $1", [job.id]);
  const comToken = providerScript.calls.filter((c) => c.pageToken !== null);
  assert(
    comToken.length === 1 && comToken[0].pageToken === "TOKEN_R2",
    "a página adiada foi buscada depois, sem duplicar a chamada",
  );
  assert(
    after.results_raw === 40,
    `nenhum resultado perdido no adiamento (results_raw=${after.results_raw})`,
  );
}

// =====================================================================
// 11. Continuidade entre cidade+categoria até target_qualified
// =====================================================================
section("11. Continua entre combinações até a meta");
await reset();
{
  // 4 combinações × 3 resultados = 12 candidatos possíveis; meta = 5.
  providerScript.pages = Array.from({ length: 4 }, (_, combo) => ({
    results: [
      place(`C${combo}_A`, { city: combo < 2 ? "Vitória" : "Vila Velha" }),
      place(`C${combo}_B`, { city: combo < 2 ? "Vitória" : "Vila Velha" }),
      place(`C${combo}_C`, { city: combo < 2 ? "Vitória" : "Vila Velha" }),
    ],
    estimatedCost: 0,
    nextPageToken: null,
  }));

  const job = await createJob(5);
  await drain(buildRunner(), 80);

  const [after] = await q("select * from job_queue where id = $1", [job.id]);

  assert(after.status === "completed", "execução concluiu");
  assert(
    after.target_qualified === 5,
    "meta permaneceu em QUALIFICADAS, não em encontradas",
  );
  assert(
    after.count_qualified >= 5,
    `meta atingida (qualificadas=${after.count_qualified})`,
  );
  assert(
    after.finish_reason === "meta_atingida",
    `encerrou por meta atingida (motivo=${after.finish_reason})`,
  );
  assert(
    providerScript.calls.length >= 2,
    `percorreu mais de uma combinação (chamadas=${providerScript.calls.length})`,
  );
  const cidades = new Set(providerScript.calls.map((c) => c.city));
  const termos = new Set(providerScript.calls.map((c) => c.term));
  assert(
    cidades.size > 1 || termos.size > 1,
    "avançou entre cidades e/ou categorias",
  );
  const [run] = await q("select * from search_runs where id = $1", [
    after.search_run_id,
  ]);
  assert(
    run.status === "completed" && run.finished_at !== null,
    "search_run fechado corretamente no caminho feliz",
  );
}

// =====================================================================
console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("✅ Correção da causa raiz validada (13 cenários).");
await pg.close();
