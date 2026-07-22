// =====================================================================
// ENSAIO da execução controlada com meta 5.
//
// NÃO é a execução de produção. Roda o job-runner REAL contra um Postgres
// real embutido (PGlite), com o provedor de coleta injetado, e emite as mesmas
// evidências que a execução de produção deve emitir.
//
// O banco é semeado para reproduzir a causa raiz de 2026-07-22: empresas
// ARQUIVADAS cujos Place IDs continuam ocupando uq_company_sources_provider_ext.
// Antes da correção, este cenário quebrava DEDUP com 23505.
//
// Uso: npm run prospect:rehearsal
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

const META = 5;

// ---- captura dos logs estruturados do runner (a evidência por fase) ----
const events = [];
const realLog = console.log;
console.log = (...args) => {
  const first = args[0];
  if (typeof first === "string" && first.startsWith('{"level"')) {
    try {
      events.push(JSON.parse(first));
      return; // não polui a saída; o relatório mostra o que importa
    } catch {
      /* não era log estruturado */
    }
  }
  realLog(...args);
};
const realError = console.error;
console.error = (...args) => {
  const first = args[0];
  if (typeof first === "string" && first.startsWith('{"level"')) {
    try {
      events.push(JSON.parse(first));
      return;
    } catch {
      /* segue */
    }
  }
  realError(...args);
};

// ---- banco ----
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
      return normalizeRows((await client.query(text, params)).rows);
    },
    async transaction(fn) {
      if (client !== pg) return fn(adapt(client));
      return pg.transaction(async (txn) => fn(adapt(txn)));
    },
  };
}
const db = adapt(pg);
const q = async (t, p = []) => (await pg.query(t, p)).rows;

// ---- perfil equivalente ao real: 4 cidades × 3 categorias = 12 combinações --
const [profile] = await q(
  `insert into search_profiles (name, status, daily_limit, provider)
   values ('ENSAIO Dentistas - Grande Vitória', 'active', 40, 'google_places')
   returning *`,
);
for (const city of ["Vitória", "Vila Velha", "Serra", "Cariacica"]) {
  await q(
    `insert into search_profile_locations (search_profile_id, city, state, country_code)
     values ($1,$2,'ES','BR')`,
    [profile.id, city],
  );
}
for (const label of ["Clínica Odontológica", "Dentista", "Odontologia"]) {
  await q(
    `insert into search_profile_categories (search_profile_id, label, active)
     values ($1,$2,true)`,
    [profile.id, label],
  );
}

// ---- CAUSA RAIZ: empresas ARQUIVADAS segurando Place IDs -------------------
// Reproduz a limpeza de 2026-07-22T15:16:26 que quebrou a execução real.
const ARQUIVADAS = [
  { place: "PLACE_V_0", nome: "Rede Odonto Vitória", fone: "+552730294331" },
  { place: "PLACE_V_1", nome: "Clivix Odontologia", fone: "+5527988818432" },
  { place: "PLACE_V_2", nome: "Central Odontologia", fone: "+5527997888565" },
];
for (const a of ARQUIVADAS) {
  const [c] = await q(
    `insert into companies (name, normalized_name, phone_e164, city, state,
                            review_status, pipeline_stage, score, deleted_at)
     values ($1,$2,$3,'Vitória','ES','approved','first_contact',88,
             '2026-07-22T15:16:26.216Z') returning *`,
    [a.nome, a.nome.toLowerCase(), a.fone],
  );
  await q(
    `insert into company_sources (company_id, provider, external_id)
     values ($1,'google_places',$2)`,
    [c.id, a.place],
  );
}

// ---- provedor: 20 por página, com uma 2ª página na 1ª combinação ----------
const providerCalls = [];
function place(id, cidade) {
  return {
    externalId: id,
    name: `Clinica ${id}`,
    primaryCategory: "Clínica odontológica",
    phone: `+55 27 3${String(Math.abs(hash(id)) % 1000).padStart(3, "0")}-${String(Math.abs(hash(id)) % 10000).padStart(4, "0")}`,
    website: null,
    instagram: null,
    addressLine: "Rua Teste, 100",
    city: cidade,
    state: "ES",
    postalCode: "29000-000",
    countryCode: "BR",
    latitude: -20.3,
    longitude: -40.3,
    rating: 4.5,
    reviewsCount: 120,
    sourceUrl: `https://maps.google.com/?q=${id}`,
    rawPayload: { id },
  };
}
function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

const provider = {
  name: "google_places",
  async search(query) {
    providerCalls.push({
      city: query.city,
      term: query.category,
      pageToken: query.pageToken ?? null,
    });
    const prefixo = `PLACE_${query.city[0]}${query.category[0]}`;
    const pagina = query.pageToken ? 1 : 0;
    // A primeira combinação de Vitória tem 2 páginas; as demais, 1.
    const temProxima =
      pagina === 0 && query.city === "Vitória" && query.category.startsWith("Cl");
    const results = Array.from({ length: 20 }, (_, i) =>
      // Os 3 primeiros da 1ª página de Vitória são os Place IDs ARQUIVADOS.
      pagina === 0 && query.city === "Vitória" && query.category.startsWith("Cl") && i < 3
        ? place(`PLACE_V_${i}`, query.city)
        : place(`${prefixo}_${pagina}_${i}`, query.city),
    );
    return {
      results,
      estimatedCost: 0.032,
      nextPageToken: temProxima ? "TOKEN_PAGINA_2" : null,
    };
  },
};

// ---- análise: equivalente ao provedor de IA, sem custo --------------------
let aiCalls = 0;
const analysis = {
  async analyzeCompany(companyId) {
    aiCalls++;
    await q(
      `update companies set review_status='pending_review', score=82, updated_at=now()
       where id=$1`,
      [companyId],
    );
    return { ok: true };
  },
};

const jobsRepo = createJobsRepository(db);
const runner = createJobRunner({
  db,
  jobs: jobsRepo,
  collection: createCollectionRepository(db),
  searchProfiles: createSearchProfilesRepository(db),
  analysis,
  resolveProvider: () => provider,
});

// ---- execução --------------------------------------------------------------
const t0 = Date.now();
const { job } = await jobsRepo.createUnique({
  jobType: "prospect_pipeline",
  searchProfileId: profile.id,
  idempotencyKey: `ensaio:${profile.id}`,
  targetQualified: META,
  maxProviderCalls: 60,
  maxAiCalls: 200,
  deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
  payload: { provider: "google_places" },
});

const fasesVistas = [];
let ticks = 0;
for (let i = 0; i < 200; i++) {
  const antes = (await q("select phase from job_queue where id=$1", [job.id]))[0];
  fasesVistas.push(antes.phase);
  const r = await runner.runTick({ budgetMs: 5000 });
  ticks++;
  const depois = (await q("select phase from job_queue where id=$1", [job.id]))[0];
  fasesVistas.push(depois.phase);
  if (!r.picked || !r.hasMoreWork) break;
}
const elapsedMs = Date.now() - t0;

// ---- apuração --------------------------------------------------------------
const [final] = await q("select * from job_queue where id=$1", [job.id]);
const [run] = await q("select * from search_runs where id=$1", [
  final.search_run_id,
]);

const orfas = await q(
  `select c.id, c.name from companies c
    left join company_sources s on s.company_id = c.id
   where s.id is null and c.source_run_id = $1`,
  [final.search_run_id],
);
const placeDuplicado = await q(
  `select external_id, count(distinct company_id)::int as donos
     from company_sources where external_id is not null
    group by external_id having count(distinct company_id) > 1`,
);
const foneDuplicado = await q(
  `select phone_e164, count(*)::int as c from companies
    where phone_e164 is not null and deleted_at is null
    group by phone_e164 having count(*) > 1`,
);
const reativadas = await q(
  "select entity_id from audit_events where action='company.reactivated'",
);
const quarentena = await q(
  "select external_id, reason from job_candidates where job_id=$1 and stage='invalid'",
  [job.id],
);
const excecoes = events.filter((e) => e.level === "error");

// ---- relatório -------------------------------------------------------------
const has = (scope) => events.some((e) => e.scope === scope);

// Cada etapa é comprovada por EVIDÊNCIA DURÁVEL no banco, não por amostragem
// de `job_queue.phase`. Um job pode atravessar as seis fases dentro de um
// único tick — foi o que aconteceu aqui — e nesse caso amostrar a fase entre
// ticks não observa as intermediárias, embora elas tenham executado.
const [normalizados] = await q(
  `select count(*)::int as c from job_candidates
    where job_id = $1 and normalized <> '{}'::jsonb`,
  [job.id],
);
const [resolvidos] = await q(
  `select count(*)::int as c from job_candidates
    where job_id = $1
      and stage in ('new','existing','duplicate','suppressed','invalid')`,
  [job.id],
);

const etapas = [
  ["SEARCH", has("job.search.page"), `${providerCalls.length} chamada(s) ao provedor`],
  [
    "NORMALIZE",
    normalizados.c > 0,
    `${normalizados.c} candidatos normalizados, ${final.count_invalid} inválidos`,
  ],
  [
    "DEDUP",
    resolvidos.c > 0,
    `${resolvidos.c} candidatos resolvidos — ${final.count_new} novas, ${final.count_existing} existentes, ${final.count_duplicate} duplicadas`,
  ],
  ["ANALYZE", has("job.analyze.batch"), `${final.count_analyzed} analisadas`],
  ["QUALIFY", has("job.qualify"), `${final.count_qualified} qualificadas`],
  ["FINISHED", final.phase === "FINISHED", `motivo: ${final.finish_reason}`],
];

realLog("\n══════════ ENSAIO — PROSPECÇÃO CONTROLADA (meta 5) ══════════");
realLog("  Postgres real (PGlite) + job-runner de produção");
realLog("  Banco semeado com 3 empresas ARQUIVADAS segurando Place IDs\n");

realLog("ETAPAS DO PIPELINE");
let etapasOk = true;
for (const [nome, ok, detalhe] of etapas) {
  realLog(`  ${ok ? "✓" : "✗"} ${nome.padEnd(10)} ${detalhe}`);
  if (!ok) etapasOk = false;
}

realLog("\nMÉTRICAS");
const linha = (k, v) => realLog(`  ${String(k).padEnd(26)} ${v}`);
linha("Empresas encontradas", final.results_raw);
linha("Empresas novas", final.count_new);
linha("Já existentes", final.count_existing);
linha("Empresas reativadas", reativadas.length);
linha("Empresas analisadas", final.count_analyzed);
linha("Empresas qualificadas", `${final.count_qualified} (meta ${final.target_qualified})`);
linha("Provider calls", `${final.used_provider_calls} de ${final.max_provider_calls}`);
linha("Chamadas de IA", `${final.used_ai_calls} de ${final.max_ai_calls} (executadas: ${aiCalls})`);
linha("Tempo total", `${(elapsedMs / 1000).toFixed(2)}s em ${ticks} tick(s)`);

realLog("\nINTEGRIDADE");
const checagens = [
  ["Retries", final.attempts === 0, `attempts = ${final.attempts}`],
  ["Exceções", excecoes.length === 0, `${excecoes.length} erro(s) registrado(s)`],
  ["Registros órfãos", orfas.length === 0, `${orfas.length} empresa(s) sem proveniência`],
  ["Duplicatas por Place ID", placeDuplicado.length === 0, `${placeDuplicado.length} Place ID com 2+ donos`],
  ["Duplicatas por telefone", foneDuplicado.length === 0, `${foneDuplicado.length} telefone repetido entre ativas`],
  ["Candidatos em quarentena", quarentena.length === 0, `${quarentena.length}`],
  ["search_run finalizado", run?.status && run.status !== "running", `status = ${run?.status}`],
];
let integridadeOk = true;
for (const [nome, ok, detalhe] of checagens) {
  realLog(`  ${ok ? "✓" : "✗"} ${nome.padEnd(26)} ${detalhe}`);
  if (!ok) integridadeOk = false;
}

realLog("\nSTATUS FINAL DO JOB");
linha("status", final.status);
linha("phase", final.phase);
linha("finish_reason", final.finish_reason);
linha("last_error", final.last_error ?? "(nenhum)");

if (excecoes.length > 0) {
  realLog("\nEXCEÇÕES REGISTRADAS");
  for (const e of excecoes) realLog("  " + JSON.stringify(e));
}

const aprovado =
  etapasOk &&
  integridadeOk &&
  final.status === "completed" &&
  final.count_qualified >= META;

realLog(
  "\n" +
    (aprovado
      ? "✅ ENSAIO APROVADO — as seis etapas concluíram, sem retries, exceções, órfãs ou duplicatas."
      : "❌ ENSAIO REPROVADO — ver itens marcados com ✗ acima."),
);
realLog("   (ensaio local; NÃO substitui a execução controlada em produção)\n");

await pg.close();
process.exit(aprovado ? 0 : 1);
