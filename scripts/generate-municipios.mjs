// =====================================================================
// Gera a base de municípios brasileiros a partir da API pública do IBGE.
//
// Executado sob demanda (não faz parte do build) e versionado no repositório,
// para que a aplicação nunca dependa de rede em tempo de execução.
//
// Uso: node scripts/generate-municipios.mjs
// Saída: src/lib/data/municipios.ts
// =====================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "lib", "data");
const outFile = join(outDir, "municipios.ts");

const IBGE_MUNICIPIOS =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
const IBGE_ESTADOS =
  "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

console.log("Baixando base do IBGE...");
const [munRes, ufRes] = await Promise.all([
  fetch(IBGE_MUNICIPIOS),
  fetch(IBGE_ESTADOS),
]);
if (!munRes.ok || !ufRes.ok) {
  throw new Error(`IBGE respondeu ${munRes.status}/${ufRes.status}`);
}

const municipios = await munRes.json();
const estados = await ufRes.json();

const ufNames = Object.fromEntries(estados.map((e) => [e.sigla, e.nome]));

// A API aninha a UF por caminhos diferentes conforme o município.
function ufOf(m) {
  return (
    m?.microrregiao?.mesorregiao?.UF?.sigla ??
    m?.regiao_imediata?.regiao_intermediaria?.UF?.sigla ??
    null
  );
}

const rows = [];
for (const m of municipios) {
  const uf = ufOf(m);
  if (!uf || !m.nome || !m.id) continue;
  rows.push([m.id, m.nome, uf]);
}
rows.sort((a, b) => a[1].localeCompare(b[1], "pt-BR") || a[2].localeCompare(b[2]));

if (rows.length < 5000) {
  throw new Error(`Base suspeita: apenas ${rows.length} municípios.`);
}

const ambiguous = new Map();
for (const [, nome] of rows) {
  const key = nome.toLowerCase();
  ambiguous.set(key, (ambiguous.get(key) ?? 0) + 1);
}
const duplicated = [...ambiguous.values()].filter((c) => c > 1).length;

const banner = `// =====================================================================
// Base de municípios brasileiros (IBGE).
// GERADO AUTOMATICAMENTE por scripts/generate-municipios.mjs — não editar.
//
// Fonte: servicodados.ibge.gov.br/api/v1/localidades
// Gerado em: ${new Date().toISOString().slice(0, 10)}
// Municípios: ${rows.length} · nomes ambíguos (repetidos entre UFs): ${duplicated}
//
// Formato compacto [códigoIBGE, nome, UF] para manter o arquivo pequeno.
// Este módulo é server-only: a busca acontece em Server Action e a base
// nunca é enviada ao navegador.
// =====================================================================

/** [código IBGE, nome do município, sigla da UF] */
export type MunicipioTuple = readonly [number, string, string];

export const UF_NAMES: Readonly<Record<string, string>> = ${JSON.stringify(ufNames, null, 2)};

export const MUNICIPIOS: readonly MunicipioTuple[] = [
${rows.map(([id, nome, uf]) => `  [${id}, ${JSON.stringify(nome)}, "${uf}"],`).join("\n")}
];
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, banner, "utf8");
console.log(
  `✓ ${rows.length} municípios gravados em src/lib/data/municipios.ts (${duplicated} nomes ambíguos)`,
);
