// =====================================================================
// Utilitários puros de deep link do WhatsApp (Blueprint §17.2).
// Sem dependências de servidor — seguros para uso no cliente (o "Abrir
// WhatsApp" precisa disparar window.open de forma síncrona no clique).
// NÃO enviam mensagens: apenas montam o link wa.me.
// =====================================================================

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
 * Monta o deep link wa.me. Retorna null se o telefone não puder ser
 * normalizado — nesse caso a abertura deve ser bloqueada.
 */
export function buildWhatsappDeepLink(
  phone: string,
  message: string,
): string | null {
  const digits = toDialableDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
