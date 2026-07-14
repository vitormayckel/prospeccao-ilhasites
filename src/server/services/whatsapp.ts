// =====================================================================
// Utilitários puros de WhatsApp e templates (Blueprint §17).
// NÃO enviam mensagens — apenas resolvem variáveis e montam o deep link.
// =====================================================================

import { ALLOWED_TEMPLATE_VARIABLES } from "@/lib/validation/template";
import type { CompanyRow } from "@/types/domain";

// Reexporta os utilitários puros de link (fonte única em @/lib/whatsapp-link).
export { toDialableDigits, buildWhatsappDeepLink } from "@/lib/whatsapp-link";

export type TemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string>>;

/**
 * Deriva os valores das variáveis a partir da empresa (Blueprint §17.1).
 * `first_name` fica em aberto para o operador preencher (não temos contato
 * nominal). `website_reference` descreve a presença digital observada.
 */
export function buildTemplateValues(company: CompanyRow): TemplateValues {
  return {
    company_name: company.name,
    city: company.city ?? undefined,
    category: company.primary_category ?? undefined,
    website_reference: company.website_url
      ? company.website_url
      : "não localizei um site próprio da empresa",
  };
}

export interface ResolveResult {
  content: string;
  /** Variáveis presentes no template mas sem valor — devem ser corrigidas. */
  missing: TemplateVariable[];
  /** Variáveis usadas que não são permitidas — bloqueiam o uso. */
  unknown: string[];
}

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Resolve as variáveis {{...}} de um template.
 * Variáveis desconhecidas bloqueiam; sem valor são sinalizadas (Blueprint §17.1).
 */
export function resolveTemplate(
  template: string,
  values: TemplateValues,
): ResolveResult {
  const missing = new Set<TemplateVariable>();
  const unknown = new Set<string>();

  const content = template.replace(VAR_RE, (_match, name: string) => {
    if (!ALLOWED_TEMPLATE_VARIABLES.includes(name as TemplateVariable)) {
      unknown.add(name);
      return `{{${name}}}`;
    }
    const value = values[name as TemplateVariable];
    if (value === undefined || value === "") {
      missing.add(name as TemplateVariable);
      return `{{${name}}}`;
    }
    return value;
  });

  return {
    content,
    missing: [...missing],
    unknown: [...unknown],
  };
}
