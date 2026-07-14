// =====================================================================
// Ilha Prospect — dataset de seed determinístico e realista.
// Fonte única de verdade para supabase/seed.sql (via generate-seed.mjs)
// e para a validação (db-validate.mjs). Não é mock de UI: é o conteúdo
// real que popula o banco. Datas relativas a now() para o dashboard.
// =====================================================================

import { createHash } from "node:crypto";

/** UUID v5-like determinístico a partir de uma chave estável. */
export function uid(key) {
  const h = createHash("sha1").update(String(key)).digest("hex");
  const s =
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-5" +
    h.slice(13, 16) +
    "-8" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32);
  return s;
}

/** Marca um valor como expressão SQL crua (não sofre quoting). */
export const raw = (sql) => ({ __raw: sql });
const arr = (values, cast) =>
  raw(
    `ARRAY[${values
      .map((v) => (typeof v === "number" ? v : `'${v}'`))
      .join(",")}]::${cast}`,
  );
const daysAgo = (n) => raw(`now() - interval '${n} days'`);
const daysAhead = (n) => raw(`now() + interval '${n} days'`);
const hoursAhead = (n) => raw(`now() + interval '${n} hours'`);

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function slug(str) {
  return normalize(str).replace(/\s+/g, "");
}
function phone(i) {
  const eight = String(30000000 + i * 137923).slice(0, 8);
  return `+5527999${eight.slice(0, 5)}`;
}

// ---------------------------------------------------------------------
// Operadores
// ---------------------------------------------------------------------
const profiles = [
  {
    id: uid("profile:operador"),
    auth_user_id: null,
    display_name: "Operador Ilha",
    email: "operador@ilhasites.com",
    role: "operator",
  },
  {
    id: uid("profile:ana"),
    auth_user_id: null,
    display_name: "Ana Prospecção",
    email: "ana@ilhasites.com",
    role: "operator",
  },
];
const operatorId = profiles[0].id;

// ---------------------------------------------------------------------
// Perfis de pesquisa + localizações + categorias
// ---------------------------------------------------------------------
const searchProfiles = [
  {
    id: uid("sp:servicos"),
    name: "Grande Vitória — serviços profissionais",
    status: "active",
    weekdays: arr([1, 2, 3, 4, 5], "smallint[]"),
    run_time: "07:00",
    timezone: "America/Sao_Paulo",
    daily_limit: 50,
    radius_meters: 15000,
    min_rating: 3.5,
    provider: "google_places",
    last_run_at: daysAgo(1),
    next_run_at: hoursAhead(18),
    deleted_at: null,
  },
  {
    id: uid("sp:saude"),
    name: "Grande Vitória — saúde e bem-estar",
    status: "paused",
    weekdays: arr([2, 4], "smallint[]"),
    run_time: "08:30",
    timezone: "America/Sao_Paulo",
    daily_limit: 30,
    radius_meters: 20000,
    min_rating: 4.0,
    provider: "google_places",
    last_run_at: daysAgo(6),
    next_run_at: null,
    deleted_at: null,
  },
];

const searchProfileLocations = [
  ["sp:servicos", "Vitória", "ES", -20.3155, -40.3128],
  ["sp:servicos", "Vila Velha", "ES", -20.3297, -40.2925],
  ["sp:servicos", "Serra", "ES", -20.1211, -40.3078],
  ["sp:saude", "Vitória", "ES", -20.3155, -40.3128],
  ["sp:saude", "Cariacica", "ES", -20.2637, -40.4166],
].map(([sp, city, state, lat, lng], i) => ({
  id: uid("spl:" + i),
  search_profile_id: uid(sp),
  city,
  state,
  country_code: "BR",
  latitude: lat,
  longitude: lng,
}));

const searchProfileCategories = [
  ["sp:servicos", "Contabilidade", "accounting"],
  ["sp:servicos", "Advocacia", "lawyer"],
  ["sp:servicos", "Estúdio de design", "graphic_designer"],
  ["sp:saude", "Clínica médica", "doctor"],
  ["sp:saude", "Odontologia", "dentist"],
].map(([sp, label, pc], i) => ({
  id: uid("spc:" + i),
  search_profile_id: uid(sp),
  label,
  provider_category: pc,
  active: true,
}));

// ---------------------------------------------------------------------
// Execuções de pesquisa
// ---------------------------------------------------------------------
const searchRuns = [
  {
    id: uid("run:1"),
    search_profile_id: uid("sp:servicos"),
    idempotency_key: "run-servicos-2026-07-13",
    trigger_type: "scheduled",
    status: "completed",
    started_at: daysAgo(1),
    finished_at: daysAgo(1),
    results_seen: 58,
    new_companies: 21,
    duplicates: 34,
    failed_items: 3,
    estimated_cost: 0.42,
    error_code: null,
    error_message: null,
  },
  {
    id: uid("run:2"),
    search_profile_id: uid("sp:saude"),
    idempotency_key: "run-saude-2026-07-08",
    trigger_type: "scheduled",
    status: "partial",
    started_at: daysAgo(6),
    finished_at: daysAgo(6),
    results_seen: 40,
    new_companies: 12,
    duplicates: 25,
    failed_items: 3,
    estimated_cost: 0.28,
    error_code: "PROVIDER_TIMEOUT",
    error_message: "Tempo limite ao paginar resultados do provedor.",
  },
  {
    id: uid("run:3"),
    search_profile_id: uid("sp:servicos"),
    idempotency_key: "run-servicos-manual-1",
    trigger_type: "manual",
    status: "failed",
    started_at: daysAgo(3),
    finished_at: daysAgo(3),
    results_seen: 0,
    new_companies: 0,
    duplicates: 0,
    failed_items: 0,
    estimated_cost: 0,
    error_code: "PROVIDER_UNAVAILABLE",
    error_message: "Provedor de locais indisponível.",
  },
];
const completedRunId = uid("run:1");

// ---------------------------------------------------------------------
// Empresas — 24 registros distribuídos pelo funil
// ---------------------------------------------------------------------
// state → comportamento (análise, decisão, pipeline, mensagens, follow-up)
const base = [
  // [name, city, state, category, hasSite, rating, reviews, wa, state]
  ["Clínica Aurora", "Vitória", "ES", "Clínica médica", false, 4.7, 132, "probable", "REVIEW"],
  ["Odonto Sorriso", "Cariacica", "ES", "Odontologia", false, 4.5, 88, "probable", "REVIEW"],
  ["Advocacia Norte", "Serra", "ES", "Advocacia", false, 4.2, 41, "unknown", "REVIEW"],
  ["Studio Vega Design", "Vitória", "ES", "Estúdio de design", true, 4.9, 26, "probable", "REVIEW"],
  ["Contabilidade Maré", "Vila Velha", "ES", "Contabilidade", false, 4.1, 57, "probable", "REVIEW"],
  ["Pet Amigo", "Serra", "ES", "Petshop", false, 4.6, 210, "confirmed", "REVIEW"],
  ["Restaurante Ilha Mar", "Vitória", "ES", "Restaurante", true, 4.4, 480, "unknown", "NEW"],
  ["Academia Corpo Livre", "Vila Velha", "ES", "Academia", false, 4.3, 96, "unknown", "NEW"],
  ["Imobiliária Litoral", "Guarapari", "ES", "Imobiliária", false, 3.9, 33, "unknown", "NEW"],
  ["Salão Beleza Real", "Cariacica", "ES", "Salão de beleza", false, 4.0, 64, "unknown", "FAILED"],
  ["Lima & Lima Contabilidade", "Vila Velha", "ES", "Contabilidade", false, 4.6, 73, "probable", "APPROVED"],
  ["Clínica Vida Plena", "Vitória", "ES", "Clínica médica", false, 4.8, 154, "confirmed", "APPROVED"],
  ["Escritório Fênix", "Serra", "ES", "Advocacia", true, 4.3, 38, "probable", "APPROVED"],
  ["Odonto Excellence", "Vitória", "ES", "Odontologia", false, 4.7, 119, "confirmed", "CONTACTED"],
  ["Contabilidade Ápice", "Vila Velha", "ES", "Contabilidade", false, 4.5, 82, "probable", "CONTACTED"],
  ["Design Coral Studio", "Vitória", "ES", "Estúdio de design", false, 4.9, 44, "probable", "CONTACTED"],
  ["Clínica Bem Estar", "Cariacica", "ES", "Clínica médica", false, 4.4, 91, "confirmed", "FOLLOWUP"],
  ["Advocacia Meridian", "Vitória", "ES", "Advocacia", false, 4.2, 52, "probable", "FOLLOWUP"],
  ["Pet Vida Saudável", "Vila Velha", "ES", "Petshop", false, 4.6, 176, "confirmed", "NEGOTIATION"],
  ["Contabilidade Horizonte", "Vitória", "ES", "Contabilidade", true, 4.7, 68, "confirmed", "CLIENT"],
  ["Clínica Sorriso Sul", "Guarapari", "ES", "Odontologia", true, 4.8, 133, "confirmed", "CLIENT"],
  ["Academia Movimento", "Serra", "ES", "Academia", true, 4.1, 210, "unknown", "LOST"],
  ["Bar do Porto", "Vitória", "ES", "Restaurante", true, 3.8, 620, "unknown", "REJECTED"],
  ["Imobiliária Enseada", "Guarapari", "ES", "Imobiliária", false, 4.0, 29, "unknown", "SNOOZED"],
];

const stageByState = {
  NEW: "new",
  FAILED: "new",
  REVIEW: "analyzed",
  APPROVED: "approved",
  CONTACTED: "first_contact",
  FOLLOWUP: "follow_up",
  NEGOTIATION: "negotiation",
  CLIENT: "client",
  LOST: "lost",
  REJECTED: "analyzed",
  SNOOZED: "analyzed",
};
const reviewByState = {
  NEW: "pending_analysis",
  FAILED: "analysis_failed",
  REVIEW: "pending_review",
  APPROVED: "approved",
  CONTACTED: "approved",
  FOLLOWUP: "approved",
  NEGOTIATION: "approved",
  CLIENT: "approved",
  LOST: "approved",
  REJECTED: "rejected",
  SNOOZED: "snoozed",
};
const priorities = ["normal", "high", "normal", "low", "normal", "high"];

const companies = [];
const companySources = [];
const aiAnalyses = [];
const companyDecisions = [];
const companyNotes = [];
const messages = [];
const followUps = [];
const pipelineEvents = [];
const auditEvents = [];

function scoreFor(hasSite, rating, i) {
  let s = hasSite ? 46 : 74; // lacuna digital pesa quando não há site
  s += Math.round((rating - 4) * 6);
  s += (i % 5) - 2;
  return Math.max(10, Math.min(97, s));
}

function analysisOutput(name, score, hasSite, city, category) {
  const potential =
    score >= 80
      ? "very_high"
      : score >= 65
        ? "high"
        : score >= 45
          ? "medium"
          : "low";
  return {
    version: "1.0",
    recommendation:
      score >= 65 ? "prioritize" : score >= 45 ? "review" : "low_priority",
    score,
    potential,
    confidence: "medium",
    executive_summary: `${name} é ${category.toLowerCase()} em ${city} com boa reputação pública e ${hasSite ? "site existente, porém com oportunidades de melhoria" : "ausência de site institucional localizado"}.`,
    score_breakdown: [
      {
        dimension: "Lacuna de presença digital",
        points: hasSite ? 12 : 27,
        max_points: 30,
        explanation: hasSite
          ? "Site encontrado, mas sem otimização evidente."
          : "Site não localizado nas fontes consultadas.",
        evidence_refs: ["source:google_places"],
      },
      {
        dimension: "Confiança e reputação pública",
        points: 12,
        max_points: 15,
        explanation: "Boa nota e volume consistente de avaliações.",
        evidence_refs: ["field:rating", "field:reviews_count"],
      },
    ],
    positives: [
      { text: "Reputação pública sólida.", evidence_refs: ["field:rating"] },
    ],
    risks: [
      {
        text: "Confirmação de WhatsApp ainda não verificada.",
        evidence_refs: ["field:whatsapp_status"],
      },
    ],
    opportunities: [
      {
        text: hasSite
          ? "Modernizar o site para captar mais contatos."
          : "Criar presença digital do zero.",
        evidence_refs: ["field:website_url"],
      },
    ],
    sales_arguments: [
      {
        text: "Site institucional premium para atrair clientes locais.",
        evidence_refs: ["source:google_places"],
      },
    ],
    missing_data: hasSite ? [] : ["website_url"],
    cautions: ["Score é recomendação, não decisão."],
  };
}

base.forEach((row, i) => {
  const [name, city, state, category, hasSite, rating, reviews, wa, st] = row;
  const cid = uid("company:" + i);
  const hasAnalysis = st !== "NEW";
  const score = hasAnalysis ? scoreFor(hasSite, rating, i) : null;
  const domain = hasSite ? `${slug(name)}.com.br` : null;

  companies.push({
    id: cid,
    name,
    normalized_name: normalize(name),
    primary_category: category,
    phone_raw: `(27) 9 ${9000 + i}-${1000 + i}`,
    phone_e164: phone(i),
    whatsapp_status: wa,
    website_url: hasSite ? `https://${domain}` : null,
    normalized_domain: domain,
    instagram_url: i % 2 === 0 ? `https://instagram.com/${slug(name)}` : null,
    address_line: `Rua Exemplo, ${100 + i}`,
    city,
    state,
    postal_code: `29${String(100 + i)}-000`,
    country_code: "BR",
    latitude: -20.3 - i * 0.001,
    longitude: -40.3 - i * 0.001,
    rating,
    reviews_count: reviews,
    pipeline_stage: stageByState[st],
    review_status: reviewByState[st],
    priority: priorities[i % priorities.length],
    score,
    next_action_at:
      st === "APPROVED" ? hoursAhead(2) : st === "FOLLOWUP" ? null : null,
    owner_id: operatorId,
    source_run_id: completedRunId,
    deleted_at: null,
    created_at: daysAgo(30 - i),
  });

  companySources.push({
    id: uid("src:" + i),
    company_id: cid,
    provider: "google_places",
    external_id: `ChIJ_${slug(name)}_${i}`,
    source_url: `https://maps.google.com/?cid=${1000 + i}`,
    raw_payload: {
      name,
      rating,
      user_ratings_total: reviews,
      formatted_phone_number: `(27) 9${9000 + i}-${1000 + i}`,
      website: hasSite ? `https://${domain}` : undefined,
    },
    collected_at: daysAgo(30 - i),
    last_seen_at: daysAgo(1),
  });

  if (hasAnalysis) {
    const failed = st === "FAILED";
    aiAnalyses.push({
      id: uid("ai:" + i),
      company_id: cid,
      status: failed ? "failed" : "completed",
      analysis_version: "1.0",
      prompt_version: "p1",
      provider: "anthropic",
      model: "claude-sonnet-5",
      input_snapshot: { name, city, category, rating, hasSite },
      output: failed ? null : analysisOutput(name, score, hasSite, city, category),
      score: failed ? null : score,
      potential: failed
        ? null
        : score >= 80
          ? "very_high"
          : score >= 65
            ? "high"
            : score >= 45
              ? "medium"
              : "low",
      confidence: failed ? null : "medium",
      tokens_input: failed ? null : 1200 + i * 5,
      tokens_output: failed ? null : 400 + i * 3,
      cost_estimate: failed ? 0 : 0.012,
      latency_ms: failed ? null : 2200 + i * 10,
      error_message: failed ? "Saída inválida após 2 tentativas." : null,
      started_at: daysAgo(29 - i),
      completed_at: daysAgo(29 - i),
    });
  }

  // Decisões humanas
  const decided = ["APPROVED", "CONTACTED", "FOLLOWUP", "NEGOTIATION", "CLIENT", "LOST", "REJECTED", "SNOOZED"].includes(st);
  if (decided) {
    const decision =
      st === "REJECTED" ? "rejected" : st === "SNOOZED" ? "snoozed" : "approved";
    companyDecisions.push({
      id: uid("dec:" + i),
      company_id: cid,
      profile_id: operatorId,
      decision,
      reason:
        decision === "rejected"
          ? "Fora do perfil de cliente."
          : decision === "snoozed"
            ? "Revisitar após temporada."
            : "Boa oportunidade, avançar.",
      notes: null,
      snoozed_until: decision === "snoozed" ? daysAhead(14) : null,
      previous_status: "pending_review",
      new_status: reviewByState[st],
      created_at: daysAgo(20 - (i % 10)),
    });
  }

  // Pipeline events (cadeia de transições)
  const chain = {
    CONTACTED: ["analyzed", "approved", "first_contact"],
    FOLLOWUP: ["analyzed", "approved", "first_contact", "follow_up"],
    NEGOTIATION: ["analyzed", "approved", "first_contact", "negotiation"],
    CLIENT: ["analyzed", "approved", "first_contact", "negotiation", "client"],
    LOST: ["analyzed", "approved", "first_contact", "lost"],
  }[st];
  if (chain) {
    let prev = "new";
    chain.forEach((to, k) => {
      pipelineEvents.push({
        id: uid(`pe:${i}:${k}`),
        company_id: cid,
        profile_id: operatorId,
        from_stage: prev,
        to_stage: to,
        reason: null,
        created_at: daysAgo(18 - k - (i % 6)),
      });
      prev = to;
    });
  }

  // Mensagens (confirmadas para quem já foi abordado)
  if (["CONTACTED", "FOLLOWUP", "NEGOTIATION", "CLIENT", "LOST"].includes(st)) {
    messages.push({
      id: uid("msg:" + i),
      company_id: cid,
      template_id: uid("tpl:first"),
      profile_id: operatorId,
      type: "first_contact",
      channel: "whatsapp",
      content: `Olá! Encontrei a ${name} enquanto pesquisava ${category.toLowerCase()} em ${city}. Trabalho com sites institucionais para negócios locais e teria uma sugestão objetiva, sem compromisso.`,
      phone_e164: phone(i),
      status: "confirmed_sent",
      opened_at: daysAgo(15 - (i % 5)),
      sent_at: daysAgo(15 - (i % 5)),
      cancelled_at: null,
    });
  }

  // Follow-ups
  if (st === "FOLLOWUP") {
    followUps.push({
      id: uid("fu:" + i),
      company_id: cid,
      assigned_to: operatorId,
      due_at: i % 2 === 0 ? hoursAhead(3) : daysAgo(1), // hoje e atrasado
      type: "follow_up",
      notes: "Retomar conversa e reforçar proposta.",
      status: "pending",
      completed_at: null,
    });
  }
  if (st === "CLIENT") {
    followUps.push({
      id: uid("fu-done:" + i),
      company_id: cid,
      assigned_to: operatorId,
      due_at: daysAgo(4),
      type: "follow_up",
      notes: "Fechamento confirmado.",
      status: "completed",
      completed_at: daysAgo(4),
    });
  }

  // Notas (algumas empresas)
  if (i % 6 === 0) {
    companyNotes.push({
      id: uid("note:" + i),
      company_id: cid,
      profile_id: operatorId,
      content: "Responsável demonstrou interesse por telefone.",
      deleted_at: null,
      created_at: daysAgo(10 - (i % 5)),
    });
  }

  auditEvents.push({
    id: uid("audit:" + i),
    actor_id: operatorId,
    entity_type: "company",
    entity_id: cid,
    action: "company.created",
    metadata: { source: "google_places" },
    created_at: daysAgo(30 - i),
  });
});

// ---------------------------------------------------------------------
// Templates de mensagem
// ---------------------------------------------------------------------
const messageTemplates = [
  {
    id: uid("tpl:first"),
    name: "Primeira abordagem — genérica",
    category: "first_contact",
    content:
      "Olá, tudo bem? Encontrei a {{company_name}} enquanto pesquisava empresas de {{category}} em {{city}}. Trabalho com criação de sites institucionais para negócios locais e identifiquei alguns pontos que podem ajudar a apresentar melhor a empresa. Se fizer sentido, posso te mostrar uma sugestão objetiva, sem compromisso.",
    allowed_variables: arr(
      ["company_name", "category", "city"],
      "text[]",
    ),
    is_default: true,
    active: true,
    version: 1,
  },
  {
    id: uid("tpl:first-clinica"),
    name: "Primeira abordagem — clínica",
    category: "first_contact",
    content:
      "Olá! Vi a {{company_name}} em {{city}} e trabalho com sites para clínicas que querem facilitar o agendamento e passar mais confiança. Posso te enviar uma ideia rápida?",
    allowed_variables: arr(["company_name", "city"], "text[]"),
    is_default: false,
    active: true,
    version: 1,
  },
  {
    id: uid("tpl:followup"),
    name: "Follow-up — retomada",
    category: "follow_up",
    content:
      "Oi! Passando para saber se você chegou a ver a sugestão que enviei para a {{company_name}}. Fico à disposição.",
    allowed_variables: arr(["company_name"], "text[]"),
    is_default: true,
    active: true,
    version: 1,
  },
  {
    id: uid("tpl:last"),
    name: "Última tentativa",
    category: "last_attempt",
    content:
      "Olá! Vou encerrar meu contato por aqui para não incomodar. Se quiser retomar sobre o site da {{company_name}}, é só me chamar. Abraço!",
    allowed_variables: arr(["company_name"], "text[]"),
    is_default: false,
    active: true,
    version: 1,
  },
];

// ---------------------------------------------------------------------
// Integrações e jobs
// ---------------------------------------------------------------------
const integrationSettings = [
  {
    id: uid("int:places"),
    provider: "google_places",
    status: "not_configured",
    config: { note: "Configurar chave via variável de ambiente." },
    last_checked_at: null,
    last_error: null,
  },
  {
    id: uid("int:ai"),
    provider: "anthropic",
    status: "not_configured",
    config: { model: "claude-sonnet-5" },
    last_checked_at: null,
    last_error: null,
  },
];

const jobQueue = [
  {
    id: uid("job:1"),
    job_type: "analyze-company",
    entity_id: uid("company:6"),
    status: "queued",
    idempotency_key: "analyze-company-6",
    payload: { company_id: uid("company:6") },
    attempts: 0,
    max_attempts: 3,
    run_after: raw("now()"),
    locked_at: null,
    last_error: null,
  },
  {
    id: uid("job:2"),
    job_type: "analyze-company",
    entity_id: uid("company:9"),
    status: "failed",
    idempotency_key: "analyze-company-9",
    payload: { company_id: uid("company:9") },
    attempts: 3,
    max_attempts: 3,
    run_after: daysAgo(3),
    locked_at: null,
    last_error: "Saída inválida após 2 tentativas.",
  },
];

// ---------------------------------------------------------------------
// Export — ordem de inserção respeita as dependências de FK
// ---------------------------------------------------------------------
export function buildDataset() {
  return {
    profiles,
    search_profiles: searchProfiles,
    search_profile_locations: searchProfileLocations,
    search_profile_categories: searchProfileCategories,
    search_runs: searchRuns,
    companies,
    company_sources: companySources,
    ai_analyses: aiAnalyses,
    company_decisions: companyDecisions,
    company_notes: companyNotes,
    message_templates: messageTemplates,
    messages,
    follow_ups: followUps,
    pipeline_events: pipelineEvents,
    integration_settings: integrationSettings,
    job_queue: jobQueue,
    audit_events: auditEvents,
  };
}
