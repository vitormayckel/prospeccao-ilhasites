// =====================================================================
// Correção dos registros afetados pela falha de DEDUP de 2026-07-22.
//
// Por padrão roda em DRY-RUN: mostra exatamente o que faria e não escreve
// nada. Só grava com --apply.
//
// Idempotente: rodar duas vezes não causa efeito adicional. Cada alvo é
// reverificado antes de ser tocado, e o script ABORTA se o registro não estiver
// no estado esperado — nunca age às cegas sobre um dado que mudou.
//
// Uso:
//   node scripts/fix-0012-affected-records.mjs            (dry-run)
//   node scripts/fix-0012-affected-records.mjs --apply    (grava)
// =====================================================================

// @next/env é CommonJS: só o export default funciona a partir de um .mjs.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.");
  process.exit(1);
}

// ---- alvos, fixados por id: nenhum critério amplo, nenhum DELETE em massa ----
const ORPHAN_COMPANY_ID = "aff9e810-2232-48f4-8baa-fe49f30ecbaf";
const STUCK_RUN_IDS = [
  "c1000c98-5112-4310-bee2-928a7f01c0bb", // job 13fdb4b2 (17:50)
  "6105478c-9a67-4044-8ea9-607eb5262206", // job dd4dbcf5 (17:52)
];
const FAILED_JOB_IDS = [
  "13fdb4b2-3892-4949-a55c-c18c2b69ac59",
  "dd4dbcf5-9b44-4027-8a96-ad440859e8a4",
];

const RUN_ERROR_MESSAGE =
  "Execução interrompida por erro permanente na deduplicação (conflito de identidade). Corrigido em 2026-07-22.";

let problems = 0;
const log = (ok, msg) => {
  console.log((ok ? "✓ " : "✗ ") + msg);
  if (!ok) problems++;
};

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

console.log(
  APPLY
    ? "MODO: --apply (as alterações abaixo SERÃO gravadas)\n"
    : "MODO: dry-run (nada será gravado; use --apply para gravar)\n",
);

// =====================================================================
// 1. Empresa órfã — arquivar (soft delete), não apagar
// =====================================================================
console.log("── 1. Empresa órfã ──");
{
  const [company] = await rest(
    `companies?select=id,name,phone_e164,deleted_at,created_at,source_run_id&id=eq.${ORPHAN_COMPANY_ID}`,
  );

  if (!company) {
    log(true, "empresa já não existe — nada a fazer (idempotente)");
  } else if (company.deleted_at) {
    log(true, "empresa já está arquivada — nada a fazer (idempotente)");
  } else {
    // Reverificação: só age se AINDA for órfã e tiver vindo da execução falha.
    const [sources, evidence, analyses, decisions, messages, notes] =
      await Promise.all([
        rest(`company_sources?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
        rest(`company_field_evidence?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
        rest(`ai_analyses?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
        rest(`company_decisions?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
        rest(`messages?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
        rest(`company_notes?select=id&company_id=eq.${ORPHAN_COMPANY_ID}`),
      ]);

    const isOrphan =
      sources.length === 0 && evidence.length === 0 && analyses.length === 0;
    const untouched = decisions.length === 0 && messages.length === 0;
    const fromFailedRun = STUCK_RUN_IDS.includes(company.source_run_id);

    console.log(
      `  alvo: "${company.name}" (${company.phone_e164})\n` +
        `  criada: ${company.created_at}\n` +
        `  fontes=${sources.length} evidências=${evidence.length} análises=${analyses.length} ` +
        `decisões=${decisions.length} mensagens=${messages.length} notas=${notes.length}\n` +
        `  origem: ${company.source_run_id}`,
    );

    log(isOrphan, "continua órfã (sem fonte, sem evidência, sem análise)");
    log(untouched, "nunca foi trabalhada (sem decisão nem mensagem)");
    log(fromFailedRun, "foi criada pela execução que falhou");

    if (!isOrphan || !untouched || !fromFailedRun) {
      console.error(
        "\n✗ ABORTADO: a empresa não está no estado esperado. " +
          "Nada foi alterado — reveja manualmente antes de prosseguir.",
      );
      process.exit(1);
    }

    if (APPLY) {
      // Arquivar (reversível) em vez de apagar: se algum dia se provar que o
      // registro era legítimo, basta limpar deleted_at — e a partir da
      // correção o pipeline sabe REATIVAR uma arquivada pelo Place ID.
      await rest(`companies?id=eq.${ORPHAN_COMPANY_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });
      await rest("audit_events", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "company",
          entity_id: ORPHAN_COMPANY_ID,
          action: "company.archived_orphan_cleanup",
          metadata: {
            motivo:
              "Empresa criada parcialmente pela falha de DEDUP de 2026-07-22 " +
              "(sem proveniência). Arquivada na correção da causa raiz.",
            jobs: FAILED_JOB_IDS,
            searchRunId: company.source_run_id,
          },
        }),
      });
      log(true, "empresa ARQUIVADA e ação registrada em audit_events");
    } else {
      console.log(
        "  → faria: UPDATE companies SET deleted_at = now() WHERE id = " +
          ORPHAN_COMPANY_ID,
      );
      console.log("  → faria: INSERT audit_events (company.archived_orphan_cleanup)");
    }
  }
}

// =====================================================================
// 2. search_runs presos em 'running'
// =====================================================================
console.log("\n── 2. search_runs presos em 'running' ──");
for (const runId of STUCK_RUN_IDS) {
  const [run] = await rest(
    `search_runs?select=id,status,finished_at,results_seen,new_companies&id=eq.${runId}`,
  );
  if (!run) {
    log(true, `${runId}: não existe — nada a fazer`);
    continue;
  }
  if (run.status !== "running") {
    log(true, `${runId}: já finalizado como '${run.status}' — nada a fazer`);
    continue;
  }

  // Contadores reais do job correspondente, para o run não mentir.
  const [job] = await rest(
    `job_queue?select=results_raw,count_new,count_existing,count_duplicate,count_failed&search_run_id=eq.${runId}`,
  );
  const payload = {
    status: "failed",
    finished_at: new Date().toISOString(),
    results_seen: job?.results_raw ?? 0,
    new_companies: job?.count_new ?? 0,
    duplicates: (job?.count_duplicate ?? 0) + (job?.count_existing ?? 0),
    failed_items: job?.count_failed ?? 0,
    error_code: "erro_permanente",
    error_message: RUN_ERROR_MESSAGE,
  };

  if (APPLY) {
    await rest(`search_runs?id=eq.${runId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    log(true, `${runId}: finalizado como 'failed'`);
  } else {
    console.log(`  → faria: UPDATE search_runs SET ${JSON.stringify(payload)}`);
    console.log(`           WHERE id = ${runId}`);
  }
}

// =====================================================================
// 3. Jobs falhos — apenas corrigir o MOTIVO registrado
// =====================================================================
console.log("\n── 3. Jobs falhos (motivo do encerramento) ──");
console.log(
  "  Os dois jobs já estão em estado terminal ('failed') e permanecem assim:\n" +
    "  são o registro histórico da falha. Só o motivo é corrigido, de\n" +
    "  'max_attempts_reached' (que sugere instabilidade) para 'erro_permanente'\n" +
    "  (que é o que de fato aconteceu). Nenhum job é reprocessado: a nova\n" +
    "  execução será um job novo.",
);
for (const jobId of FAILED_JOB_IDS) {
  const [job] = await rest(
    `job_queue?select=id,status,finish_reason&id=eq.${jobId}`,
  );
  if (!job) {
    log(true, `${jobId}: não existe — nada a fazer`);
    continue;
  }
  if (job.status !== "failed") {
    log(true, `${jobId}: status '${job.status}' — não é alvo, nada a fazer`);
    continue;
  }
  if (job.finish_reason === "erro_permanente") {
    log(true, `${jobId}: motivo já corrigido — nada a fazer`);
    continue;
  }
  if (APPLY) {
    await rest(`job_queue?id=eq.${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({ finish_reason: "erro_permanente" }),
    });
    log(true, `${jobId}: motivo ajustado para 'erro_permanente'`);
  } else {
    console.log(
      `  → faria: UPDATE job_queue SET finish_reason='erro_permanente' WHERE id=${jobId}`,
    );
  }
}

// =====================================================================
console.log("");
if (problems > 0) {
  console.error(`❌ ${problems} verificação(ões) não conferiram. Nada aplicado.`);
  process.exit(1);
}
console.log(
  APPLY
    ? "✅ Registros afetados corrigidos."
    : "✅ Dry-run concluído. Reexecute com --apply para gravar.",
);
