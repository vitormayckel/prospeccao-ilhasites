import "server-only";
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from "@/server/providers/analysis/types";
import { AnalysisError } from "@/server/providers/analysis/types";
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_TOOL_SCHEMA,
} from "@/server/providers/analysis/prompt";

// =====================================================================
// Provedor de análise Anthropic (Claude) — Messages API.
// Doc: https://docs.anthropic.com/en/api/messages
// Saída estruturada via "tool use" forçado, garantindo JSON no formato do
// contrato (Blueprint §9.5); a validação Zod final ocorre no service.
// Exige ANTHROPIC_API_KEY + billing ativo.
// =====================================================================

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TOOL_NAME = "registrar_analise";

/** Preço por 1M tokens (US$). Ajustável por env conforme o modelo. */
function pricing(): { input: number; output: number } {
  const input = Number(process.env.ANTHROPIC_COST_PER_MTOK_INPUT);
  const output = Number(process.env.ANTHROPIC_COST_PER_MTOK_OUTPUT);
  return {
    input: Number.isFinite(input) && input >= 0 ? input : 3,
    output: Number.isFinite(output) && output >= 0 ? output : 15,
  };
}

interface AnthropicResponse {
  content?: Array<{ type: string; name?: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

export function createAnthropicAnalysisProvider(config: {
  apiKey: string;
  model: string;
}): AnalysisProvider {
  return {
    name: "anthropic",
    async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
      const started = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const userContent = [
          "Analise a empresa a seguir e registre o resultado pela ferramenta.",
          "Use SOMENTE os dados do snapshot. Cite evidence_refs válidos.",
          "",
          JSON.stringify(request.snapshot, null, 2),
        ].join("\n");

        const response = await fetch(MESSAGES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 2048,
            system: ANALYSIS_SYSTEM_PROMPT,
            tools: [
              {
                name: TOOL_NAME,
                description:
                  "Registra a análise comercial estruturada da empresa.",
                input_schema: ANALYSIS_TOOL_SCHEMA,
              },
            ],
            tool_choice: { type: "tool", name: TOOL_NAME },
            messages: [{ role: "user", content: userContent }],
          }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new AnalysisError(
            `Anthropic retornou ${response.status}: ${await safeError(response)}`,
          );
        }

        const data = (await response.json()) as AnthropicResponse;
        const toolUse = data.content?.find(
          (block) => block.type === "tool_use" && block.name === TOOL_NAME,
        );
        if (!toolUse?.input) {
          throw new AnalysisError(
            "Resposta da IA não retornou a análise estruturada esperada.",
          );
        }

        const tokensInput = data.usage?.input_tokens ?? null;
        const tokensOutput = data.usage?.output_tokens ?? null;
        const rates = pricing();
        const costEstimate =
          ((tokensInput ?? 0) / 1_000_000) * rates.input +
          ((tokensOutput ?? 0) / 1_000_000) * rates.output;

        // A validação Zod do contrato (§9.5) é feita no service.
        return {
          analysis: toolUse.input as AnalysisResponse["analysis"],
          provider: "anthropic",
          model: data.model ?? config.model,
          promptVersion: request.promptVersion,
          tokensInput,
          tokensOutput,
          costEstimate,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new AnalysisError("Anthropic excedeu o tempo limite (30s).");
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

async function safeError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; type?: string };
    };
    return data.error?.message ?? data.error?.type ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
