import type { Db } from "@/lib/database/sql";
import type {
  AiAnalysisRow,
  CompanyRow,
  ProspectAnalysis,
  AiPotential,
  AiConfidence,
} from "@/types/domain";

export function createAiAnalysesRepository(db: Db) {
  return {
    /** Cria o registro da análise já em execução (Blueprint §9.6/7). */
    async createRunning(input: {
      companyId: string;
      provider: string;
      model: string;
      promptVersion: string;
      snapshot: Record<string, unknown>;
    }): Promise<AiAnalysisRow> {
      const rows = await db.query<AiAnalysisRow>(
        `insert into ai_analyses
           (company_id, status, prompt_version, provider, model, input_snapshot, started_at)
         values ($1, 'running', $2, $3, $4, $5, now())
         returning *`,
        [
          input.companyId,
          input.promptVersion,
          input.provider,
          input.model,
          input.snapshot,
        ],
      );
      return rows[0]!;
    },

    async complete(
      id: string,
      input: {
        model: string;
        output: ProspectAnalysis;
        score: number;
        potential: AiPotential;
        confidence: AiConfidence;
        tokensInput: number | null;
        tokensOutput: number | null;
        costEstimate: number;
        latencyMs: number;
      },
    ): Promise<AiAnalysisRow> {
      const rows = await db.query<AiAnalysisRow>(
        `update ai_analyses set
           status = 'completed', model = $2, output = $3, score = $4,
           potential = $5, confidence = $6, tokens_input = $7,
           tokens_output = $8, cost_estimate = $9, latency_ms = $10,
           completed_at = now(), updated_at = now()
         where id = $1 returning *`,
        [
          id,
          input.model,
          input.output,
          input.score,
          input.potential,
          input.confidence,
          input.tokensInput,
          input.tokensOutput,
          input.costEstimate,
          input.latencyMs,
        ],
      );
      return rows[0]!;
    },

    async markFailed(id: string, errorMessage: string): Promise<void> {
      await db.query(
        `update ai_analyses set status = 'failed', error_message = $2,
           completed_at = now(), updated_at = now() where id = $1`,
        [id, errorMessage],
      );
    },

    /** Empresas aguardando análise (RF-07). */
    async listCompaniesPendingAnalysis(limit: number): Promise<CompanyRow[]> {
      return db.query<CompanyRow>(
        `select * from companies
         where review_status = 'pending_analysis' and deleted_at is null
         order by created_at asc
         limit ${Number(limit)}`,
      );
    },

    async countPendingAnalysis(): Promise<number> {
      const rows = await db.query<{ c: number }>(
        `select count(*)::int as c from companies
         where review_status = 'pending_analysis' and deleted_at is null`,
      );
      return rows[0]?.c ?? 0;
    },

    async latestByCompany(companyId: string): Promise<AiAnalysisRow | null> {
      const rows = await db.query<AiAnalysisRow>(
        "select * from ai_analyses where company_id = $1 order by created_at desc limit 1",
        [companyId],
      );
      return rows[0] ?? null;
    },
  };
}

export type AiAnalysesRepository = ReturnType<
  typeof createAiAnalysesRepository
>;
