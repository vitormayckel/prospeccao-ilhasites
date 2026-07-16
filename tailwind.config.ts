import type { Config } from "tailwindcss";

/**
 * Tokens do Ilha Prospect — fonte de verdade: Blueprint v1 (§13).
 * Tema escuro, minimalista. Referências: Linear, Vercel, Raycast, Arc.
 * As cores usam variáveis CSS definidas em src/app/globals.css.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "surface-deep": "var(--surface-deep)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      /*
       * Profundidade no escuro vem de três camadas somadas: contorno de 1px,
       * sombra de contato curta e sombra de ambiente longa. Nunca sombra única
       * e pesada — isso lê como bootstrap antigo.
       */
      boxShadow: {
        raise:
          "0 1px 2px rgba(0,0,0,0.5), 0 8px 24px -14px rgba(0,0,0,0.9)",
        lift: "0 2px 4px rgba(0,0,0,0.5), 0 14px 32px -16px rgba(0,0,0,0.95)",
      },
      /*
       * Escala tipográfica do produto. Cada degrau tem um papel — não usar
       * tamanhos avulsos. Textos grandes recebem tracking negativo (óptica);
       * rótulos pequenos recebem tracking positivo (legibilidade).
       */
      fontSize: {
        /*
         * display e kpi carregam o destaque só com escala e ajuste óptico:
         * quanto maior o corpo, mais fechado o tracking. É o que dá presença
         * a uma grotesca sem apelar para outra família tipográfica.
         */
        display: [
          "32px",
          { lineHeight: "1.15", letterSpacing: "-0.03em", fontWeight: "600" },
        ],
        kpi: [
          "44px",
          { lineHeight: "1", letterSpacing: "-0.042em", fontWeight: "600" },
        ],
        "kpi-sm": [
          "26px",
          { lineHeight: "1", letterSpacing: "-0.025em", fontWeight: "600" },
        ],
        title: [
          "20px",
          { lineHeight: "26px", letterSpacing: "-0.018em", fontWeight: "600" },
        ],
        heading: [
          "15px",
          { lineHeight: "20px", letterSpacing: "-0.011em", fontWeight: "600" },
        ],
        body: ["14px", { lineHeight: "22px", letterSpacing: "-0.006em" }],
        meta: ["13px", { lineHeight: "18px", letterSpacing: "-0.003em" }],
        micro: ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        label: [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.07em", fontWeight: "500" },
        ],
      },
      borderRadius: {
        card: "10px",
        control: "8px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
