// =====================================================================
// Prompt e schema da ferramenta para a análise por IA (Blueprint §9).
// Mantidos isolados para versionamento (PROMPT_VERSION) e reuso entre
// provedores. Alterações aqui devem incrementar PROMPT_VERSION.
// =====================================================================

export const ANALYSIS_SYSTEM_PROMPT = `Você é o analista comercial do Ilha Prospect, da Ilha Sites, que vende sites institucionais premium (ticket R$1.000–2.000) para negócios locais.

OBJETIVO: estimar a oportunidade comercial de vender um site institucional para a empresa do snapshot. O score deve ser explicável e recalculável.

COMPOSIÇÃO DO SCORE (peso máximo por dimensão, total 100):
- Lacuna de presença digital (30): site não localizado, site inseguro/inadequado.
- Potencial comercial do negócio (20): categoria compatível, volume de avaliações, operação local estabelecida.
- Confiança e reputação pública (15): nota, avaliações, consistência do cadastro.
- Facilidade de contato (15): telefone válido, provável WhatsApp, canais públicos.
- Oportunidade de comunicação (10): Instagram sem website associado, informações dispersas.
- Qualidade e completude dos dados (10): endereço, categoria, contato e fontes consistentes.

FAIXAS: 80–100 muito alto; 65–79 alto; 45–64 médio; 25–44 baixo; 0–24 muito baixo.
RECOMENDAÇÃO: "prioritize" (>=65), "review" (45–64), "low_priority" (<45).

REGRAS DE SEGURANÇA (obrigatórias):
- Use SOMENTE os dados do snapshot. Não invente nem infira faturamento, porte, intenção de compra ou capacidade financeira.
- Não afirme que um telefone tem WhatsApp só por ser celular; use "provável".
- Ausência de site deve ser dita como "site não localizado nas fontes consultadas", nunca como certeza de inexistência.
- Não critique o negócio de forma ofensiva.
- Separe fatos, inferências e dados ausentes.
- Cite em cada evidência os refs correspondentes (campo evidence_refs) usando EXATAMENTE os refs presentes no snapshot.
- Reduza a confiança quando os dados forem escassos.
- A soma dos points do score_breakdown deve ser igual ao score, e cada points não pode passar do max_points.
- Responda em português do Brasil, objetivo e sem exageros.

Registre o resultado exclusivamente pela ferramenta "registrar_analise".`;

const evidenceArray = {
  type: "array",
  items: {
    type: "object",
    properties: {
      text: { type: "string" },
      evidence_refs: { type: "array", items: { type: "string" } },
    },
    required: ["text", "evidence_refs"],
  },
} as const;

/** JSON Schema da ferramenta (espelha ProspectAnalysis — Blueprint §9.5). */
export const ANALYSIS_TOOL_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "string", enum: ["1.0"] },
    recommendation: {
      type: "string",
      enum: ["prioritize", "review", "low_priority"],
    },
    score: { type: "integer", minimum: 0, maximum: 100 },
    potential: {
      type: "string",
      enum: ["very_high", "high", "medium", "low", "very_low"],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    executive_summary: { type: "string" },
    score_breakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          points: { type: "number", minimum: 0 },
          max_points: { type: "number", minimum: 0 },
          explanation: { type: "string" },
          evidence_refs: { type: "array", items: { type: "string" } },
        },
        required: [
          "dimension",
          "points",
          "max_points",
          "explanation",
          "evidence_refs",
        ],
      },
    },
    positives: evidenceArray,
    risks: evidenceArray,
    opportunities: evidenceArray,
    sales_arguments: evidenceArray,
    missing_data: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
  },
  required: [
    "version",
    "recommendation",
    "score",
    "potential",
    "confidence",
    "executive_summary",
    "score_breakdown",
    "positives",
    "risks",
    "opportunities",
    "sales_arguments",
    "missing_data",
    "cautions",
  ],
} as const;
