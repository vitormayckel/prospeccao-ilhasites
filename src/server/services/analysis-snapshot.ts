import type { CompanyRow, CompanySourceRow } from "@/types/domain";
import type {
  CompanySnapshot,
  EvidenceItem,
} from "@/server/providers/analysis/types";

// =====================================================================
// Monta o snapshot da empresa para a IA (Blueprint §9.6, passos 1-2).
// Só inclui dados permitidos e gera identificadores de evidência estáveis.
// Ausência de site é declarada como "não localizado" (RN-04), nunca como
// certeza de inexistência.
// =====================================================================

const WHATSAPP_LABEL: Record<string, string> = {
  unknown: "não verificado",
  probable: "provável (número celular)",
  confirmed: "confirmado",
  invalid: "inválido",
};

export function buildCompanySnapshot(
  company: CompanyRow,
  sources: CompanySourceRow[] = [],
): CompanySnapshot {
  const evidence: EvidenceItem[] = [];
  const missingFields: string[] = [];

  const add = (ref: string, description: string, value: string | null) => {
    if (value && value.trim()) {
      evidence.push({ ref, description, value: value.trim() });
    } else {
      missingFields.push(ref);
    }
  };

  add("field:name", "Nome do negócio", company.name);
  add("field:category", "Categoria principal", company.primary_category);
  add(
    "field:phone",
    "Telefone",
    company.phone_e164 ?? company.phone_raw ?? null,
  );

  // WhatsApp: nunca afirmar confirmação sem verificação (§9.4).
  evidence.push({
    ref: "field:whatsapp",
    description: "Status de WhatsApp",
    value: WHATSAPP_LABEL[company.whatsapp_status] ?? "não verificado",
  });

  // Presença de site é o sinal-chave da Ilha Sites (§9.2).
  if (company.website_url) {
    evidence.push({
      ref: "field:website",
      description: "Website",
      value: company.website_url,
    });
  } else {
    evidence.push({
      ref: "field:website",
      description: "Website",
      value: "site não localizado nas fontes consultadas",
    });
    missingFields.push("field:website");
  }

  add("field:instagram", "Instagram", company.instagram_url);
  add(
    "field:address",
    "Endereço",
    [company.address_line, company.city, company.state]
      .filter(Boolean)
      .join(", ") || null,
  );

  if (company.rating != null) {
    evidence.push({
      ref: "field:rating",
      description: "Reputação pública",
      value: `nota ${company.rating} com ${company.reviews_count ?? 0} avaliações`,
    });
  } else {
    missingFields.push("field:rating");
  }

  sources.forEach((source, index) => {
    if (source.source_url) {
      evidence.push({
        ref: `source:${source.provider}:${index}`,
        description: `Fonte (${source.provider})`,
        value: source.source_url,
      });
    }
  });

  return {
    companyId: company.id,
    fields: {
      name: company.name,
      primary_category: company.primary_category,
      phone: company.phone_e164 ?? company.phone_raw,
      whatsapp_status: company.whatsapp_status,
      has_website: Boolean(company.website_url),
      website_url: company.website_url,
      instagram_url: company.instagram_url,
      address: company.address_line,
      city: company.city,
      state: company.state,
      rating: company.rating,
      reviews_count: company.reviews_count,
    },
    evidence,
    missingFields,
  };
}

/** Conjunto de refs válidos do snapshot (para verificar citações — §9.6/6). */
export function snapshotRefs(snapshot: CompanySnapshot): Set<string> {
  return new Set(snapshot.evidence.map((e) => e.ref));
}
