// =====================================================================
// Gera supabase/seed.sql a partir do dataset determinístico.
// Uso: node scripts/generate-seed.mjs
// =====================================================================

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDataset } from "./seed/dataset.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "supabase", "seed.sql");

function serialize(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object" && "__raw" in value) return value.__raw;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  // objeto plano → jsonb
  const json = JSON.stringify(value).replace(/'/g, "''");
  return `'${json}'::jsonb`;
}

function tableInsert(table, rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => `  (${columns.map((c) => serialize(row[c])).join(", ")})`)
    .join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values};\n`;
}

const dataset = buildDataset();

const header = `-- =====================================================================
-- Ilha Prospect — seed.sql (GERADO por scripts/generate-seed.mjs)
-- Não editar à mão. Rode: npm run db:generate-seed
-- Dados realistas para desenvolvimento. Datas relativas a now().
-- =====================================================================

`;

const body = Object.entries(dataset)
  .map(([table, rows]) => tableInsert(table, rows))
  .filter(Boolean)
  .join("\n");

writeFileSync(outPath, header + body, "utf8");

const total = Object.values(dataset).reduce((a, r) => a + r.length, 0);
console.log(`seed.sql gerado: ${total} registros em ${outPath}`);
