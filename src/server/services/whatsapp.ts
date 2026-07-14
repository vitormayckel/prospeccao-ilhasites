// =====================================================================
// Utilitários puros de WhatsApp e templates (Blueprint §17).
// NÃO enviam mensagens — apenas resolvem variáveis e montam o deep link.
// =====================================================================

import { ALLOWED_TEMPLATE_VARIABLES } from "@/lib/validation/template";

export type TemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string>>;

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

/** Normaliza um telefone para apenas dígitos com DDI (Brasil por padrão). */
export function toDialableDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // já tem DDI 55
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  // número nacional (DDD + número) → prefixa 55
  if (digits.length === 10 || digits.length === 11) {
    return "55" + digits;
  }
  return null;
}

/**
 * Monta o deep link wa.me (Blueprint §17.2). Retorna null se o telefone
 * não puder ser normalizado — nesse caso a abertura deve ser bloqueada.
 */
export function buildWhatsappDeepLink(
  phone: string,
  message: string,
): string | null {
  const digits = toDialableDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
