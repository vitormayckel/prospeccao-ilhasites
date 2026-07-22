// =====================================================================
// Corrige `companies.commercial_factors` gravado com dupla codificação.
//
// O cast `$3::jsonb` fazia o postgres.js inferir jsonb pelo cast e serializar
// o parâmetro mais uma vez. Como o valor já era uma string JSON, o que ficou
// gravado é um ESCALAR string ("[{...}]") em vez de um array — e o detalhe da
// empresa quebrava em `commercial_factors.map is not a function`.
//
//   node scripts/fix-commercial-factors-encoding.mjs           → dry-run
//   node scripts/fix-commercial-factors-encoding.mjs --apply   → corrige
//
// Idempotente: linhas já em forma de array são ignoradas. Não toca em
// nenhuma outra coluna.
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
  console.error("Credenciais ausentes em .env.local");
  process.exit(1);
}
const APLICAR = process.argv.includes("--apply");
const cabecalhos = (extra = {}) => ({
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  "Content-Type": "application/json",
  ...extra,
});

const empresas = await fetch(
  `${URL_BASE}/rest/v1/companies?select=id,name,commercial_factors`,
  { headers: cabecalhos() },
).then((r) => r.json());

console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nenhuma escrita)\n");

let jaOk = 0;
let corrigidas = 0;
let irrecuperaveis = 0;

for (const empresa of empresas) {
  const bruto = empresa.commercial_factors;

  if (Array.isArray(bruto)) {
    jaOk++;
    continue;
  }

  let parsed = null;
  if (typeof bruto === "string") {
    try {
      const tentativa = JSON.parse(bruto);
      if (Array.isArray(tentativa)) parsed = tentativa;
    } catch {
      /* cai em irrecuperável abaixo */
    }
  }

  if (parsed === null) {
    // Nunca inventar dado: sem array recuperável, a lista fica vazia — a
    // interface já trata isso como "sem motivos registrados".
    irrecuperaveis++;
    console.log(
      `  ! ${empresa.id.slice(0, 8)} ${(empresa.name ?? "").slice(0, 30).padEnd(32)} valor não recuperável → []`,
    );
    parsed = [];
  }

  if (!APLICAR) {
    corrigidas++;
    console.log(
      `  ~ ${empresa.id.slice(0, 8)} ${(empresa.name ?? "").slice(0, 30).padEnd(32)} string → array de ${parsed.length}`,
    );
    continue;
  }

  const r = await fetch(`${URL_BASE}/rest/v1/companies?id=eq.${empresa.id}`, {
    method: "PATCH",
    headers: cabecalhos({ Prefer: "return=representation" }),
    body: JSON.stringify({ commercial_factors: parsed }),
  });
  if (!r.ok) {
    console.error(`  ✗ ${empresa.id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    continue;
  }
  const [depois] = await r.json();
  const ok = Array.isArray(depois.commercial_factors);
  corrigidas++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${empresa.id.slice(0, 8)} ${(empresa.name ?? "").slice(0, 30).padEnd(32)} array de ${depois.commercial_factors?.length ?? "?"}`,
  );
}

console.log(
  `\ntotal ${empresas.length} · já corretas ${jaOk} · ${APLICAR ? "corrigidas" : "a corrigir"} ${corrigidas} · não recuperáveis ${irrecuperaveis}`,
);
if (!APLICAR) console.log("\nNada foi escrito. Rode com --apply para executar.");
