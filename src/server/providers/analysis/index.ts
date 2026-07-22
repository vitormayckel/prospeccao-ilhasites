import {
  type AnalysisProvider,
  AnalysisProviderNotConfiguredError,
} from "@/server/providers/analysis/types";
import { createFixtureAnalysisProvider } from "@/server/providers/analysis/fixture-provider";
import { createAnthropicAnalysisProvider } from "@/server/providers/analysis/anthropic-provider";

export * from "@/server/providers/analysis/types";

/** Versão do prompt/contrato — persistida em ai_analyses.prompt_version. */
export const PROMPT_VERSION = "2026-07-22.1";

/**
 * Resolve o provedor de análise.
 * - `anthropic`: análise real (Claude). Habilitado com ANTHROPIC_API_KEY.
 * - `fixture`: determinístico e sem custo (dev/testes).
 */
export function getAnalysisProvider(name: string): AnalysisProvider {
  switch (name) {
    case "fixture":
      return createFixtureAnalysisProvider();
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AnalysisProviderNotConfiguredError("anthropic");
      return createAnthropicAnalysisProvider({
        apiKey,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      });
    }
    default:
      throw new AnalysisProviderNotConfiguredError(name);
  }
}

/**
 * Provedor padrão da aplicação. Usa ANALYSIS_PROVIDER quando definido;
 * senão `anthropic` se houver API key; senão cai no `fixture` (sem custo).
 */
export function resolveDefaultAnalysisProvider(): AnalysisProvider {
  const configured = process.env.ANALYSIS_PROVIDER;
  if (configured) return getAnalysisProvider(configured);
  if (process.env.ANTHROPIC_API_KEY) return getAnalysisProvider("anthropic");
  return getAnalysisProvider("fixture");
}
