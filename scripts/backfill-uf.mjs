// =====================================================================
// Backfill de UF e código IBGE (FASE 3).
//
// Corrige registros gravados com a UF errada por causa do default "ES" do
// formulário antigo (ex.: Betim/ES -> Betim/MG) e preenche o código IBGE.
//
// SEGURANÇA:
//   - modo RELATÓRIO por padrão; nada é alterado sem --apply;
//   - só corrige casos INEQUÍVOCOS: o nome do município deve existir em
//     exatamente UMA UF na base do IBGE, e não existir na UF gravada;
//   - cidades ambíguas são listadas e NUNCA alteradas automaticamente;
//   - idempotente: rodar de novo não altera mais nada;
//   - grava o estado anterior em backfill_uf_audit para restauração.
//
// Uso:
//   node scripts/backfill-uf.mjs             # relatório (não altera nada)
//   node scripts/backfill-uf.mjs --apply     # aplica as correções
//   node scripts/backfill-uf.mjs --rollback  # desfaz usando a auditoria
// =====================================================================

import fs from "node:fs";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

// Nomes das UFs (apenas para state_name).
const UF_NAME = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};


// ---- base oficial de municípios -------------------------------------
const src = fs.readFileSync("src/lib/data/municipios.ts", "utf8");
const MUNICIPIOS = [
  ...src.matchAll(/\[(\d+), ("(?:[^"\\]|\\.)*"), "([A-Z]{2})"\]/g),
].map((m) => ({ ibge: Number(m[1]), city: JSON.parse(m[2]), uf: m[3] }));

if (MUNICIPIOS.length < 5000) {
  throw new Error(`Base de municípios incompleta (${MUNICIPIOS.length}).`);
}

const norm = (v) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map();
for (const m of MUNICIPIOS) {
  const k = norm(m.city);
  byName.set(k, [...(byName.get(k) ?? []), m]);
}

/** exact | corrected | ambiguous | unknown */
function resolve(city, uf) {
  const options = byName.get(norm(city)) ?? [];
  if (options.length === 0) return { status: "unknown", options };
  const exact = options.find((o) => o.uf === (uf ?? "").toUpperCase());
  if (exact) return { status: "exact", target: exact, options };
  if (options.length === 1) return { status: "corrected", target: options[0], options };
  return { status: "ambiguous", options };
}

// ---- conexão ---------------------------------------------------------
const url = fs
  .readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .trim();

const sql = postgres(url, {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});
const q = (t, p = []) => sql.unsafe(t, p);

// Exige que a tabela de auditoria exista com RLS ativo. Criá-la aqui deixaria
// uma tabela sem RLS no banco — a migration 0010 é a fonte de verdade.
async function requireAuditTable(name) {
  const [row] = await q(
    `select c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1`,
    [name],
  );
  if (!row) {
    console.error(
      `✗ Tabela "${name}" não existe. Aplique a migration 0010_backfill_audit.sql antes de rodar este script.`,
    );
    process.exit(1);
  }
  if (!row.rls) {
    console.error(
      `✗ Tabela "${name}" existe mas está SEM row level security. Provavelmente foi criada por uma versão antiga deste script; execute:\n    alter table ${name} enable row level security;`,
    );
    process.exit(1);
  }
}

const money = (n) => String(n).padStart(4);

try {
  // A tabela de auditoria faz parte do schema versionado (migration 0010),
  // com RLS como todas as demais. O script não a cria: se faltar, a migration
  // não foi aplicada e criá-la aqui produziria uma tabela sem RLS.
  await requireAuditTable("backfill_uf_audit");

  // ------------------------------------------------------------------
  // ROLLBACK
  // ------------------------------------------------------------------
  if (ROLLBACK) {
    const audit = await q("select * from backfill_uf_audit order by applied_at");
    if (audit.length === 0) {
      console.log("Nada a desfazer: auditoria vazia.");
    }
    for (const a of audit) {
      if (a.table_name === "search_profile_locations") {
        await q(
          `update search_profile_locations
             set city=$2, state=$3, ibge_code=null, state_name=null, updated_at=now()
           where id=$1`,
          [a.row_id, a.old_city, a.old_state],
        );
      } else if (a.table_name === "companies") {
        await q(
          "update companies set state=$2, ibge_code=null, updated_at=now() where id=$1",
          [a.row_id, a.old_state],
        );
      }
    }
    await q("delete from backfill_uf_audit");
    console.log(`✓ ${audit.length} registro(s) restaurados ao estado anterior.`);
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  console.log(
    APPLY
      ? "=== BACKFILL DE UF — MODO APLICAÇÃO ===\n"
      : "=== BACKFILL DE UF — RELATÓRIO (nada será alterado) ===\n",
  );

  const plan = { corrected: [], ambiguous: [], unknown: [], exact: 0 };

  // ------------------------------------------------------------------
  // 1. Localidades dos perfis de pesquisa
  // ------------------------------------------------------------------
  const locations = await q(
    `select l.id, l.city, l.state, l.ibge_code, l.search_profile_id, p.name as profile_name
       from search_profile_locations l
       left join search_profiles p on p.id = l.search_profile_id
      order by l.city`,
  );

  for (const loc of locations) {
    const r = resolve(loc.city, loc.state);
    const entry = {
      table: "search_profile_locations",
      id: loc.id,
      city: loc.city,
      from: loc.state,
      to: r.target?.uf ?? null,
      ibge: r.target?.ibge ?? null,
      context: `perfil "${loc.profile_name ?? "(sem perfil)"}"`,
      options: r.options.map((o) => o.uf),
    };
    if (r.status === "exact") {
      plan.exact++;
      if (!loc.ibge_code) plan.corrected.push({ ...entry, to: loc.state, onlyIbge: true });
    } else if (r.status === "corrected") plan.corrected.push(entry);
    else if (r.status === "ambiguous") plan.ambiguous.push(entry);
    else plan.unknown.push(entry);
  }

  // ------------------------------------------------------------------
  // 2. Empresas coletadas
  // ------------------------------------------------------------------
  const companies = await q(
    `select id, name, city, state, ibge_code, review_status, score
       from companies where deleted_at is null and city is not null
      order by city`,
  );

  for (const c of companies) {
    const r = resolve(c.city, c.state);
    const entry = {
      table: "companies",
      id: c.id,
      city: c.city,
      from: c.state,
      to: r.target?.uf ?? null,
      ibge: r.target?.ibge ?? null,
      context: `empresa "${c.name}"`,
      options: r.options.map((o) => o.uf),
    };
    if (r.status === "exact") {
      plan.exact++;
      if (!c.ibge_code) plan.corrected.push({ ...entry, to: c.state, onlyIbge: true });
    } else if (r.status === "corrected") plan.corrected.push(entry);
    else if (r.status === "ambiguous") plan.ambiguous.push(entry);
    else plan.unknown.push(entry);
  }

  // ------------------------------------------------------------------
  // 3. Relatório
  // ------------------------------------------------------------------
  const ufChanges = plan.corrected.filter((e) => !e.onlyIbge);
  const ibgeOnly = plan.corrected.filter((e) => e.onlyIbge);

  console.log(`Localidades de perfil analisadas : ${money(locations.length)}`);
  console.log(`Empresas analisadas             : ${money(companies.length)}`);
  console.log(`Já corretas (cidade+UF confere) : ${money(plan.exact)}`);
  console.log(`Correções de UF inequívocas     : ${money(ufChanges.length)}`);
  console.log(`Somente preenchimento de IBGE   : ${money(ibgeOnly.length)}`);
  console.log(`AMBÍGUAS (exigem decisão humana): ${money(plan.ambiguous.length)}`);
  console.log(`Não encontradas no IBGE         : ${money(plan.unknown.length)}\n`);

  if (ufChanges.length) {
    console.log("--- Correções de UF que serão aplicadas ---");
    const grouped = new Map();
    for (const e of ufChanges) {
      const k = `${e.city}: ${e.from ?? "(vazio)"} -> ${e.to}`;
      grouped.set(k, [...(grouped.get(k) ?? []), e]);
    }
    for (const [k, items] of grouped) {
      console.log(`  ${k}  (${items.length} registro(s))`);
      for (const i of items.slice(0, 5)) console.log(`      · ${i.context}`);
      if (items.length > 5) console.log(`      · ... +${items.length - 5}`);
    }
    console.log();
  }

  if (plan.ambiguous.length) {
    console.log("--- AMBÍGUAS: não serão alteradas automaticamente ---");
    for (const e of plan.ambiguous.slice(0, 30)) {
      console.log(
        `  ${e.city} (atual: ${e.from ?? "vazio"}) existe em: ${e.options.join(", ")} — ${e.context}`,
      );
    }
    console.log();
  }

  if (plan.unknown.length) {
    console.log("--- Não encontradas na base do IBGE (revisar manualmente) ---");
    for (const e of plan.unknown.slice(0, 30)) {
      console.log(`  ${e.city}/${e.from ?? "?"} — ${e.context}`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log("Nada foi alterado. Para aplicar: node scripts/backfill-uf.mjs --apply");
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  // ------------------------------------------------------------------
  // 4. Aplicação — idempotente e auditada
  // ------------------------------------------------------------------
  let applied = 0;
  for (const e of plan.corrected) {
    const municipio = MUNICIPIOS.find(
      (m) => norm(m.city) === norm(e.city) && m.uf === e.to,
    );
    if (!municipio) continue;

    await q(
      `insert into backfill_uf_audit
         (table_name,row_id,old_city,old_state,new_city,new_state,new_ibge)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [e.table, e.id, e.city, e.from, municipio.city, municipio.uf, municipio.ibge],
    );

    if (e.table === "search_profile_locations") {
      await q(
        `update search_profile_locations
           set state=$2, ibge_code=$3, state_name=$4, updated_at=now()
         where id=$1`,
        [e.id, municipio.uf, municipio.ibge, UF_NAME[municipio.uf] ?? municipio.uf],
      );
    } else {
      // Empresas: só UF e IBGE. Análises, score, decisões e histórico
      // permanecem intocados.
      await q(
        "update companies set state=$2, ibge_code=$3, updated_at=now() where id=$1",
        [e.id, municipio.uf, municipio.ibge],
      );
    }
    applied++;
  }

  console.log(`✓ ${applied} registro(s) corrigidos.`);
  console.log("  Auditoria em backfill_uf_audit.");
  console.log("  Para desfazer: node scripts/backfill-uf.mjs --rollback");
} catch (e) {
  console.error("FALHA:", e.code || "", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
