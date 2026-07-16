import "server-only";
import type { HealthRepository, HealthCounts } from "@/server/repositories/health-repository";
import { getPlacesProvider } from "@/server/providers/places";
import { getAnalysisProvider } from "@/server/providers/analysis";
import pkg from "../../../package.json";

// =====================================================================
// Saúde do Sistema (§Config). Snapshot carregado uma vez na abertura da
// página — sem polling, histórico ou monitoramento. Nunca expõe valores
// de variáveis, apenas presença.
// =====================================================================

export type HealthTone = "ok" | "warn" | "error";

export interface HealthStatus {
  tone: HealthTone;
  detail: string;
}

export interface EnvCheck {
  name: string;
  present: boolean;
}

export interface HealthReport {
  supabase: HealthStatus;
  googlePlaces: HealthStatus;
  anthropic: HealthStatus & { model: string | null };
  requiredEnv: EnvCheck[];
  migration0005: HealthStatus;
  counts: HealthCounts | null;
  version: { version: string; commit: string | null };
  lastAnalysisAt: string | null;
}

/** Variáveis obrigatórias verificadas (apenas presença, nunca o valor). */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "GOOGLE_PLACES_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "";
}

export function createHealthService(deps: { health: HealthRepository }) {
  const { health } = deps;

  return {
    async getReport(): Promise<HealthReport> {
      // --- Supabase: conexão + leitura simples + contagens ---
      let supabase: HealthStatus;
      let counts: HealthCounts | null = null;
      try {
        const ok = await health.ping();
        counts = await health.counts();
        supabase = ok
          ? { tone: "ok", detail: "Conexão e leitura do banco OK." }
          : { tone: "error", detail: "Resposta inesperada do banco." };
      } catch {
        supabase = {
          tone: "error",
          detail: "Falha ao conectar ou ler o banco.",
        };
      }

      // --- Google Places: chave + provider carregado ---
      let googlePlaces: HealthStatus;
      if (!hasEnv("GOOGLE_PLACES_API_KEY")) {
        googlePlaces = { tone: "error", detail: "Chave ausente." };
      } else {
        try {
          getPlacesProvider("google_places");
          googlePlaces = {
            tone: "ok",
            detail: "Chave configurada · provider carregado.",
          };
        } catch {
          googlePlaces = {
            tone: "error",
            detail: "Chave presente, mas o provider não carregou.",
          };
        }
      }

      // --- Anthropic: chave + provider + modelo ---
      const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
      let anthropic: HealthStatus & { model: string | null };
      if (!hasEnv("ANTHROPIC_API_KEY")) {
        anthropic = { tone: "error", detail: "Chave ausente.", model: null };
      } else {
        try {
          getAnalysisProvider("anthropic");
          anthropic = {
            tone: "ok",
            detail: "Chave configurada · provider carregado.",
            model,
          };
        } catch {
          anthropic = {
            tone: "error",
            detail: "Chave presente, mas o provider não carregou.",
            model,
          };
        }
      }

      // --- Variáveis obrigatórias (presença apenas) ---
      const requiredEnv: EnvCheck[] = REQUIRED_ENV.map((name) => ({
        name,
        present: hasEnv(name),
      }));

      // --- Migration 0005: enum message_kind contém after_conversation ---
      let migration0005: HealthStatus;
      try {
        const applied = await health.messageKindHasValue("after_conversation");
        migration0005 = applied
          ? { tone: "ok", detail: "Migration aplicada." }
          : {
              tone: "warn",
              detail: "Migration pendente (categoria extra indisponível).",
            };
      } catch {
        migration0005 = {
          tone: "error",
          detail: "Não foi possível verificar a migration.",
        };
      }

      // --- Versão ---
      const commit =
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        process.env.GIT_COMMIT_SHA?.slice(0, 7) ??
        null;

      // --- Última análise ---
      let lastAnalysisAt: string | null = null;
      try {
        lastAnalysisAt = await health.lastAnalysisAt();
      } catch {
        lastAnalysisAt = null;
      }

      return {
        supabase,
        googlePlaces,
        anthropic,
        requiredEnv,
        migration0005,
        counts,
        version: { version: pkg.version, commit },
        lastAnalysisAt,
      };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
