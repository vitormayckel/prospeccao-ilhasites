// =====================================================================
// Normalização de dados coletados (Blueprint RF-05).
// Funções puras: telefone → E.164, domínio, nome, cidade, endereço.
// Executadas ANTES da deduplicação para maximizar a taxa de match.
// =====================================================================

import { toDialableDigits } from "@/server/services/whatsapp";

/** Remove acentos e reduz a caixa/espaços para comparação estável. */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza um nome de empresa para busca/dedup: sem acento, minúsculo,
 * pontuação colapsada em espaço e espaços únicos.
 */
export function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normaliza cidade da mesma forma que o nome (usada no dedup nível 4). */
export function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const normalized = normalizeName(city);
  return normalized || null;
}

/**
 * Normaliza telefone para E.164 (+55...) quando possível.
 * Reaproveita a discagem do WhatsApp (dígitos com DDI) e prefixa "+".
 */
export function normalizePhoneE164(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = toDialableDigits(phone);
  return digits ? `+${digits}` : null;
}

/**
 * Extrai o domínio canônico de uma URL de site: sem protocolo, sem "www.",
 * sem caminho/porta, minúsculo. Retorna null se não houver host válido.
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    const domain = host.replace(/^www\./, "");
    return domain || null;
  } catch {
    return null;
  }
}

/** Normaliza URL para armazenamento: garante protocolo, remove barra final. */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Normaliza endereço em linha única para comparação aproximada. */
export function normalizeAddress(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  const normalized = normalizeName(address);
  return normalized || null;
}
