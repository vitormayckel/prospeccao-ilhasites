// =====================================================================
// Resolvedor do alias "@/" para os scripts de validação.
//
// O Node já executa TypeScript nativamente (type stripping), mas não conhece
// o alias "@/..." do tsconfig. Este hook o traduz para caminho de arquivo,
// permitindo que os scripts importem o código REAL de src/ — services,
// repositories e providers — em vez de reimplementar a lógica em SQL solto.
//
// Uso: node --import ./scripts/ts-alias-loader.mjs <script>
// (as importações de "server-only" exigem também --conditions=react-server)
// =====================================================================

import { register } from "node:module";
import { pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url).href;

/** Extensões tentadas para um alias sem extensão, na ordem do tsconfig. */
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }
  const base = SRC + specifier.slice(2);
  for (const ext of CANDIDATES) {
    try {
      return await nextResolve(base + ext, context);
    } catch {
      // Tenta a próxima extensão.
    }
  }
  throw new Error(`Não foi possível resolver o alias "${specifier}".`);
}

register(pathToFileURL(import.meta.filename ?? import.meta.url));
