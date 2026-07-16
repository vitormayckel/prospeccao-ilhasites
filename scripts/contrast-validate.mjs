/**
 * Valida o contraste WCAG dos tokens de texto sobre as superfícies do tema.
 * Lê as cores direto de src/app/globals.css — se um token mudar, este script
 * acompanha. Falha (exit 1) quando alguma combinação usada cai abaixo de AA.
 *
 * Uso: node scripts/contrast-validate.mjs
 */
import { readFile } from "node:fs/promises";

const AA = 4.5;

const css = await readFile(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`Token --${name} não encontrado em globals.css`);
  return m[1].toLowerCase();
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// surface-2 entra na lista porque é o fundo dos cards em hover.
const surfaces = ["background", "surface-1", "surface-2"];
const texts = [
  "text-primary",
  "text-secondary",
  "text-muted",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
];

let failures = 0;
for (const t of texts) {
  const cells = surfaces.map((s) => {
    const r = ratio(token(t), token(s));
    if (r < AA) failures++;
    return `${s} ${r.toFixed(2)}${r >= AA ? "" : " FALHA"}`;
  });
  console.log(t.padEnd(15), cells.join(" | "));
}

if (failures > 0) {
  console.error(`\n${failures} combinação(ões) abaixo de AA ${AA}:1`);
  process.exit(1);
}
console.log(`\nOK — todas as combinações passam AA ${AA}:1`);
