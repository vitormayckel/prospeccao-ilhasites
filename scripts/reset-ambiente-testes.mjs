// =====================================================================
// Reset do ambiente de testes — apaga DADOS operacionais, preserva
// estrutura, migrations, índices, configurações e perfis de pesquisa.
//
//   node scripts/reset-ambiente-testes.mjs            → dry-run (não escreve)
//   node scripts/reset-ambiente-testes.mjs --apply    → executa
//   node scripts/reset-ambiente-testes.mjs --apply --purge-perfis-teste
//        → também remove definitivamente os perfis de teste já arquivados
//
// A ordem respeita as chaves estrangeiras: filhos antes dos pais. Nada aqui
// toca em schema. Idempotente: rodar de novo em base limpa não faz nada.
// =====================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHAVE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local");
  process.exit(1);
}

const APLICAR = process.argv.includes("--apply");
const PURGAR_PERFIS = process.argv.includes("--purge-perfis-teste");

const cabecalhos = (extra = {}) => ({
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  "Content-Type": "application/json",
  ...extra,
});

async function contar(tabela, filtro = "") {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*${filtro}`, {
    headers: cabecalhos({ Prefer: "count=exact", Range: "0-0" }),
  });
  if (!r.ok) throw new Error(`${tabela}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const cr = r.headers.get("content-range") ?? "*/0";
  return Number(cr.split("/")[1] ?? 0);
}

async function apagar(tabela, filtro) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?${filtro}`, {
    method: "DELETE",
    headers: cabecalhos({ Prefer: "return=representation" }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${tabela}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t).length : 0;
}

// Filhos primeiro. `id=not.is.null` casa com todas as linhas — o PostgREST
// exige um filtro explícito em DELETE, o que é uma proteção bem-vinda.
const TODAS = "id=not.is.null";
const ALVOS = [
  ["job_candidates", TODAS, "candidatos das execuções de teste"],
  ["job_queue", TODAS, "jobs do pipeline"],
  ["company_field_evidence", TODAS, "evidências de campo por empresa"],
  ["ai_analyses", TODAS, "análises de IA"],
  ["company_sources", TODAS, "fontes/Place IDs coletados"],
  ["company_notes", TODAS, "notas"],
  ["company_decisions", TODAS, "decisões humanas"],
  ["messages", TODAS, "mensagens"],
  ["follow_ups", TODAS, "follow-ups"],
  ["pipeline_events", TODAS, "eventos de pipeline"],
  ["companies", TODAS, "empresas (ativas e arquivadas)"],
  ["search_runs", TODAS, "execuções de coleta"],
  ["audit_events", TODAS, "auditoria das execuções de teste"],
  ["backfill_uf_audit", TODAS, "auditoria do backfill de UF (script pontual)"],
  ["unmerge_audit", TODAS, "auditoria do unmerge de redes sociais (script pontual)"],
];

// Preservados por decisão explícita, listados para conferência.
const PRESERVADOS = [
  "search_profiles",
  "search_profile_categories",
  "search_profile_locations",
  "suppression_list",
  "message_templates",
  "integration_settings",
  "profiles",
];

console.log(APLICAR ? "MODO: APLICAR (escreve no banco)\n" : "MODO: DRY-RUN (nenhuma escrita)\n");

let total = 0;
console.log("A REMOVER");
for (const [tabela, filtro, descricao] of ALVOS) {
  const antes = await contar(tabela);
  total += antes;
  if (!APLICAR) {
    console.log(`  ${tabela.padEnd(26)} ${String(antes).padStart(5)}  ${descricao}`);
    continue;
  }
  if (antes === 0) {
    console.log(`  ${tabela.padEnd(26)} ${"0".padStart(5)}  já vazio`);
    continue;
  }
  const removidos = await apagar(tabela, filtro);
  const depois = await contar(tabela);
  const ok = depois === 0;
  console.log(
    `  ${tabela.padEnd(26)} ${String(removidos).padStart(5)}  removidos · restam ${depois} ${ok ? "OK" : "ATENÇÃO"}`,
  );
}
console.log(`  ${"".padEnd(26)} ${String(total).padStart(5)}  linhas no total\n`);

// ---- perfis de pesquisa ----------------------------------------------------
const perfis = await fetch(
  `${URL_BASE}/rest/v1/search_profiles?select=id,name,status,daily_limit,deleted_at,last_run_at,next_run_at&order=created_at`,
  { headers: cabecalhos() },
).then((r) => r.json());

console.log("PERFIS DE PESQUISA");
for (const p of perfis) {
  console.log(
    `  ${p.id.slice(0, 8)} ${(p.name ?? "").slice(0, 42).padEnd(44)} ${p.deleted_at ? "arquivado" : "ATIVO    "} limite=${p.daily_limit}`,
  );
}

const arquivados = perfis.filter((p) => p.deleted_at);
if (PURGAR_PERFIS && APLICAR && arquivados.length > 0) {
  for (const p of arquivados) {
    await apagar("search_profile_categories", `search_profile_id=eq.${p.id}`);
    await apagar("search_profile_locations", `search_profile_id=eq.${p.id}`);
    await apagar("search_profiles", `id=eq.${p.id}`);
  }
  console.log(`  → ${arquivados.length} perfis arquivados removidos definitivamente`);
} else if (arquivados.length > 0) {
  console.log(
    `  → ${arquivados.length} perfis arquivados preservados (use --purge-perfis-teste para remover)`,
  );
}

// Zera o agendamento dos perfis vivos: sem isso um last_run_at de teste pode
// influenciar a próxima janela de execução.
if (APLICAR) {
  const vivos = perfis.filter((p) => !p.deleted_at);
  for (const p of vivos) {
    if (p.last_run_at === null && p.next_run_at === null) continue;
    await fetch(`${URL_BASE}/rest/v1/search_profiles?id=eq.${p.id}`, {
      method: "PATCH",
      headers: cabecalhos(),
      body: JSON.stringify({ last_run_at: null, next_run_at: null }),
    });
    console.log(`  → agendamento zerado: ${p.name}`);
  }
}

console.log("\nPRESERVADOS (nenhuma linha tocada)");
for (const t of PRESERVADOS) {
  console.log(`  ${t.padEnd(28)} ${await contar(t)}`);
}

if (!APLICAR) console.log("\nNada foi escrito. Rode com --apply para executar.");
