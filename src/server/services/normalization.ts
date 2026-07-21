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
/**
 * Domínios que NUNCA identificam uma empresa.
 *
 * O Google devolve o perfil da rede social em `websiteUri` quando o negócio
 * não tem site próprio. Tratar isso como domínio fundia empresas distintas:
 * observado em produção, 14 negócios diferentes de Vitória, Vila Velha,
 * Cariacica e Serra colapsaram em um único registro porque todos tinham
 * "instagram.com" como domínio. São leads reais perdidos.
 *
 * Um perfil social é evidência de contato, não de identidade.
 */
const SOCIAL_DOMAINS = new Set([
  "instagram.com",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "linktr.ee",
  "linktree.com",
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
  "whatsapp.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "beacons.ai",
  "bio.link",
  "bit.ly",
  "google.com",
  "sites.google.com",
  "business.site",
  "negocio.site",
]);

/** O domínio pertence a uma rede social / encurtador (nunca é identidade)? */
export function isSocialDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (SOCIAL_DOMAINS.has(d)) return true;
  // Subdomínios de plataformas (ex.: algumaloja.business.site)
  return [...SOCIAL_DOMAINS].some((s) => d.endsWith(`.${s}`));
}

/**
 * Domínio PRÓPRIO da empresa — a única forma aceitável de usar domínio como
 * chave de deduplicação. Devolve null para redes sociais e encurtadores.
 *
 * `normalizeDomain` continua existindo para exibição/diagnóstico; para
 * identidade, use sempre esta.
 */
export function normalizeOwnDomain(
  url: string | null | undefined,
): string | null {
  const domain = normalizeDomain(url);
  return domain && !isSocialDomain(domain) ? domain : null;
}

/**
 * UF sempre em sigla de 2 letras. O provedor pode devolver o nome por
 * extenso ("Espírito Santo"), que quebraria a dedup por cidade+UF.
 */
const UF_BY_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA",
  ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO",
  maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO",
  roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE",
  tocantins: "TO",
};

export function normalizeUf(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = stripDiacritics(raw).toLowerCase().replace(/\s+/g, " ");
  return UF_BY_NAME[key] ?? raw.toUpperCase().slice(0, 2);
}

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
