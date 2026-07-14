// =====================================================================
// Contrato desacoplado da camada de IA (Blueprint §9).
// Qualquer modelo (Anthropic, fixture, outro) implementa AnalysisProvider.
// A aplicação nunca conhece o provedor concreto — só esta interface.
// =====================================================================

import type { ProspectAnalysis } from "@/types/domain";

/** Uma evidência referenciável no snapshot (Blueprint §9.6, passos 1-2). */
export interface EvidenceItem {
  /** Identificador estável citado pela IA em evidence_refs (ex.: "field:website"). */
  ref: string;
  /** Descrição legível do que a evidência representa. */
  description: string;
  /** Valor observado (fato). "ausente" quando o dado não foi localizado. */
  value: string;
}

/**
 * Snapshot com APENAS dados permitidos (Blueprint §9.4/§9.6). É a única
 * entrada da IA — nada além disto pode ser inferido.
 */
export interface CompanySnapshot {
  companyId: string;
  fields: Record<string, string | number | boolean | null>;
  evidence: EvidenceItem[];
  missingFields: string[];
}

export interface AnalysisRequest {
  snapshot: CompanySnapshot;
  promptVersion: string;
}

export interface AnalysisResponse {
  analysis: ProspectAnalysis;
  provider: string;
  model: string;
  promptVersion: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  costEstimate: number;
  latencyMs: number;
}

/** Provedor de análise de IA. */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResponse>;
}

/** Lançado quando o provedor existe mas não está configurado (sem API key). */
export class AnalysisProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(
      `Provedor de IA "${providerName}" não está configurado. ` +
        `Defina a API key e habilite a integração antes de analisar.`,
    );
    this.name = "AnalysisProviderNotConfiguredError";
  }
}

/** Erro de análise (resposta inválida, timeout, falha de API) — sanitizado. */
export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisError";
  }
}
