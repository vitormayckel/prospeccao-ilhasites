// =====================================================================
// Valida que TODA data exibida sai no fuso oficial (America/Sao_Paulo),
// independentemente do fuso do processo.
//
// O servidor da Vercel roda em UTC. Sem `timeZone` explícito o Intl usa o
// fuso do ambiente, e o horário renderizado no servidor saía 3 horas
// adiantado — além de divergir do que o navegador mostraria após hidratar.
//
// Este script força TZ=UTC no processo (o pior caso, igual à produção) e
// exige que a saída continue em horário de Brasília.
//
// Uso: npm run timezone:validate
// =====================================================================

// TZ precisa valer ANTES de os formatadores serem construídos. Import estático
// é içado e rodaria primeiro, então a carga aqui é dinâmica — assim o script
// funciona igual no Windows, sem depender de `TZ=UTC` na linha de comando.
process.env.TZ = "UTC";

const {
  formatDate,
  formatDateTime,
  formatTime,
  formatDueCompact,
  formatDueLabel,
  APP_TIME_ZONE,
} = await import("@/lib/format");

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("✓ " + msg);
  else {
    console.error("✗ " + msg);
    failures++;
  }
}
const section = (t) => console.log("\n── " + t + " ──");

console.log(`processo rodando em TZ=${process.env.TZ} (igual à Vercel)`);
assert(APP_TIME_ZONE === "America/Sao_Paulo", "fuso oficial é America/Sao_Paulo");

// =====================================================================
section("1. Horário sai em Brasília, não em UTC");
{
  // 2026-07-22T20:39:32Z = 17:39:32 em Brasília (UTC-3).
  const iso = "2026-07-22T20:39:32.000Z";
  assert(formatTime(iso) === "17:39:32", `formatTime → 17:39:32 (obtido: ${formatTime(iso)})`);
  assert(
    formatDateTime(iso) === "22/07/2026, 17:39",
    `formatDateTime → 22/07/2026, 17:39 (obtido: ${formatDateTime(iso)})`,
  );
  assert(formatDate(iso) === "22/07/2026", `formatDate → 22/07/2026 (obtido: ${formatDate(iso)})`);
}

// =====================================================================
section("2. Virada de dia: 01:30Z ainda é o dia ANTERIOR em Brasília");
{
  // O caso que mais engana: 23/07 01:30 UTC = 22/07 22:30 em Brasília.
  const iso = "2026-07-23T01:30:00.000Z";
  assert(
    formatDate(iso) === "22/07/2026",
    `a data recua um dia (obtido: ${formatDate(iso)})`,
  );
  assert(formatTime(iso) === "22:30:00", `hora correta (obtido: ${formatTime(iso)})`);
}

// =====================================================================
section("3. Nulos continuam rendendo travessão, não 'Invalid Date'");
{
  assert(formatDate(null) === "—", "formatDate(null)");
  assert(formatDateTime(undefined) === "—", "formatDateTime(undefined)");
  assert(formatTime(null) === "—", "formatTime(null)");
}

// =====================================================================
section("4. 'Hoje' é o mesmo DIA DE CALENDÁRIO, não 24 horas");
{
  const agora = new Date();
  const spHoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);

  // Fim do dia de hoje em Brasília: 23:59 local. Ainda é "Hoje", por mais
  // perto da meia-noite que esteja.
  const fimDoDia = new Date(`${spHoje}T23:59:00-03:00`);
  const r1 = formatDueCompact(fimDoDia.toISOString());
  assert(r1.today === true, `23:59 de hoje é "Hoje" (obtido: ${r1.label})`);
  assert(r1.overdue === false, "23:59 de hoje não está atrasado");

  // Início do dia de hoje: 00:01 local. Também "Hoje", nunca "Atrasado".
  const inicioDoDia = new Date(`${spHoje}T00:01:00-03:00`);
  const r2 = formatDueCompact(inicioDoDia.toISOString());
  assert(r2.today === true, `00:01 de hoje é "Hoje" (obtido: ${r2.label})`);
  assert(r2.overdue === false, "00:01 de hoje não conta como atrasado");

  // Ontem às 23:59 é atrasado, mesmo faltando poucos minutos de diferença.
  const ontem = new Date(new Date(`${spHoje}T00:01:00-03:00`).getTime() - 2 * 60000);
  const r3 = formatDueCompact(ontem.toISOString());
  assert(r3.overdue === true, `ontem 23:59 é atrasado (obtido: ${r3.label})`);

  // Amanhã cedo é "Amanhã", não "Hoje".
  const amanha = new Date(
    new Date(`${spHoje}T23:59:00-03:00`).getTime() + 2 * 60000,
  );
  const r4 = formatDueCompact(amanha.toISOString());
  assert(r4.label === "Amanhã", `amanhã 00:01 é "Amanhã" (obtido: ${r4.label})`);
  assert(r4.today === false, "amanhã não é hoje");
}

// =====================================================================
section("5. REGRESSÃO: a comparação por duração errava a fronteira");
{
  const agora = new Date();
  const spHoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);

  // Um vencimento amanhã às 23:00 fica a ~1,x dias de distância. A regra
  // antiga arredondava a duração e podia rotular "Amanhã" um vencimento de
  // depois de amanhã, e vice-versa. Aqui exigimos a resposta do calendário.
  const amanha23 = new Date(`${spHoje}T23:00:00-03:00`);
  amanha23.setTime(amanha23.getTime() + 86400000);
  const r = formatDueCompact(amanha23.toISOString());
  assert(
    r.label === "Amanhã",
    `vencimento de amanhã 23:00 → "Amanhã" (obtido: ${r.label})`,
  );

  const rotulo = formatDueLabel(amanha23.toISOString());
  assert(
    rotulo.startsWith("Amanhã ("),
    `formatDueLabel concorda com formatDueCompact (obtido: ${rotulo})`,
  );
}

// =====================================================================
section("6. Fronteira do dia no BANCO usa Brasília, não UTC");
{
  const { readFileSync, readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { createDashboardRepository } = await import(
    "@/server/repositories/dashboard-repository"
  );
  const { normalizeRows } = await import("@/lib/database/sql");

  const dir = dirname(fileURLToPath(import.meta.url));
  const pg = new PGlite({ extensions: { pg_trgm } });
  await pg.waitReady;
  for (const f of readdirSync(join(dir, "..", "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(join(dir, "..", "supabase", "migrations", f), "utf8"));
  }
  await pg.exec(readFileSync(join(dir, "..", "supabase", "seed.sql"), "utf8"));

  const db = {
    async query(text, params = []) {
      return normalizeRows((await pg.query(text, params)).rows);
    },
    async transaction(fn) {
      return pg.transaction(async () => fn(db));
    },
  };
  const dashboard = createDashboardRepository(db);

  await pg.query("delete from follow_ups");
  await pg.query("delete from companies");
  const [empresa] = (
    await pg.query(
      `insert into companies (name, normalized_name, city, state, review_status, pipeline_stage)
       values ('Alvo','alvo','Vitória','ES','pending_review','analyzed') returning *`,
    )
  ).rows;

  // Instante crítico: 01:30 UTC de HOJE-UTC ainda é ONTEM 22:30 em Brasília.
  // Com o corte em UTC este follow-up contava como "hoje"; com o corte em
  // Brasília ele é o que de fato é — atrasado.
  await pg.query(
    `insert into follow_ups (company_id, due_at, status, type)
     values ($1, date_trunc('day', now()) + interval '1 hour 30 minutes', 'pending', 'follow_up')`,
    [empresa.id],
  );
  // E um às 12:00 de Brasília de hoje, que é inequivocamente "hoje".
  await pg.query(
    `insert into follow_ups (company_id, due_at, status, type)
     values ($1,
       (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
         + interval '12 hours', 'pending', 'follow_up')`,
    [empresa.id],
  );

  const resumo = await dashboard.getSummary();
  const [check] = (
    await pg.query(
      `select
         (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
           <> date_trunc('day', now()) as difere`,
    )
  ).rows;

  assert(
    check.difere === true,
    "o corte de dia em Brasília realmente difere do corte em UTC",
  );
  assert(
    resumo.followUpsDueToday === 1,
    `apenas o de hoje (12:00 BRT) conta como "hoje" (obtido: ${resumo.followUpsDueToday})`,
  );
  assert(
    resumo.followUpsOverdue === 1,
    `o de 01:30 UTC conta como atrasado (obtido: ${resumo.followUpsOverdue})`,
  );
  await pg.close();
}

// =====================================================================
console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("✅ Fuso horário de exibição validado (6 cenários).");
