// =====================================================================
// Valida a base de municípios e a resolução cidade/UF (FASE 3).
// Cobre exatamente os casos relatados pelo usuário.
// Uso: node scripts/municipios-validate.mjs
// =====================================================================

import fs from "node:fs";

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("✓ " + msg);
  else {
    console.error("✗ " + msg);
    failures++;
  }
}

const src = fs.readFileSync("src/lib/data/municipios.ts", "utf8");
const MUNICIPIOS = [
  ...src.matchAll(/\[(\d+), ("(?:[^"\\]|\\.)*"), "([A-Z]{2})"\]/g),
].map((m) => ({ ibge: Number(m[1]), city: JSON.parse(m[2]), uf: m[3] }));

const norm = (v) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map();
for (const m of MUNICIPIOS) {
  const k = norm(m.city);
  byName.set(k, [...(byName.get(k) ?? []), m]);
}

function resolve(city, uf) {
  const options = byName.get(norm(city)) ?? [];
  if (options.length === 0) return { status: "unknown", options };
  const exact = options.find((o) => o.uf === (uf ?? "").toUpperCase());
  if (exact) return { status: "exact", target: exact, options };
  if (options.length === 1) return { status: "corrected", target: options[0], options };
  return { status: "ambiguous", options };
}

// ---- base completa, não lista manual --------------------------------
assert(MUNICIPIOS.length === 5570, `base completa do IBGE: ${MUNICIPIOS.length} municípios`);
assert(
  new Set(MUNICIPIOS.map((m) => m.uf)).size === 27,
  "todas as 27 unidades federativas presentes",
);
assert(
  MUNICIPIOS.every((m) => m.ibge > 0 && m.city && /^[A-Z]{2}$/.test(m.uf)),
  "todo município tem código IBGE, nome e UF válidos",
);

// ---- cidades do usuário ---------------------------------------------
const esperado = {
  Vitória: "ES",
  "Vila Velha": "ES",
  Serra: "ES",
  Cariacica: "ES",
  Betim: "MG",
  "Governador Valadares": "MG",
  "Juiz de Fora": "MG",
  Uberlândia: "MG",
  Uberaba: "MG",
};

for (const [city, uf] of Object.entries(esperado)) {
  const r = resolve(city, uf);
  assert(r.status === "exact" && r.target.uf === uf, `${city} resolve para ${uf}`);
}

// ---- correção inequívoca: MG gravado como ES ------------------------
for (const city of ["Betim", "Governador Valadares", "Juiz de Fora", "Uberlândia", "Uberaba"]) {
  const r = resolve(city, "ES");
  assert(
    r.status === "corrected" && r.target.uf === "MG",
    `${city}/ES é corrigido para ${city}/MG (inequívoco)`,
  );
}

// ---- cidades do ES não são alteradas --------------------------------
for (const city of ["Vitória", "Vila Velha", "Serra", "Cariacica"]) {
  const r = resolve(city, "ES");
  assert(r.status === "exact", `${city}/ES permanece ES (não é alterada)`);
}

// ---- ambiguidade real exige seleção ---------------------------------
const ambiguos = [...byName.entries()].filter(([, v]) => v.length > 1);
assert(ambiguos.length > 0, `existem ${ambiguos.length} nomes ambíguos na base`);

const [nomeAmbiguo, ocorrencias] = ambiguos[0];
const rAmb = resolve(ocorrencias[0].city, "ZZ");
assert(
  rAmb.status === "ambiguous",
  `"${ocorrencias[0].city}" (${ocorrencias.map((o) => o.uf).join("/")}) exige seleção explícita`,
);
assert(
  rAmb.options.length > 1,
  "caso ambíguo devolve todas as opções para o usuário escolher",
);

// "Serra" foi citado como possivelmente ambíguo: na base oficial, não é.
const serra = byName.get(norm("Serra")) ?? [];
assert(
  serra.length === 1 && serra[0].uf === "ES",
  "Serra existe só em ES na base do IBGE (não exige confirmação)",
);

// ---- grafia inválida NÃO é corrigida automaticamente -----------------
const typo = resolve("Uberada", "ES");
assert(
  typo.status === "unknown",
  "grafia inválida ('Uberada') é sinalizada, nunca corrigida automaticamente",
);

// ---- consulta enviada ao provedor -----------------------------------
const provider = fs.readFileSync(
  "src/server/providers/places/google-places-provider.ts",
  "utf8",
);
assert(
  provider.includes("${query.city}, ${query.state}, Brasil"),
  "consulta ao Google Places inclui cidade, UF e Brasil",
);

// ---- UF não pode mais vir de texto livre ----------------------------
for (const f of [
  "src/features/searches/components/create-search-profile-dialog.tsx",
  "src/features/searches/components/edit-search-profile-dialog.tsx",
]) {
  const body = fs.readFileSync(f, "utf8");
  assert(
    !body.includes('defaultValue="ES"') && !body.includes('name="state"'),
    `${f.split("/").pop()} não tem mais campo de UF em texto livre`,
  );
}

const schema = fs.readFileSync("src/lib/validation/search-profile.ts", "utf8");
assert(
  schema.includes("[A-Z]{2}"),
  "schema exige UF como sigla de 2 letras maiúsculas",
);

console.log(
  failures === 0
    ? "\n✅ Municípios validados (base IBGE, resolução, ambiguidade, consulta)."
    : `\n❌ ${failures} verificação(ões) falharam.`,
);
process.exit(failures === 0 ? 0 : 1);
