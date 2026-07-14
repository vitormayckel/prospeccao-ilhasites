import type { CompaniesRepository } from "@/server/repositories/companies-repository";
import type { PipelineRepository } from "@/server/repositories/pipeline-repository";
import type { CompanyRow, PipelineStage } from "@/types/domain";

/** Estágios terminais reversíveis (RN-08). */
const TERMINAL: PipelineStage[] = ["client", "lost"];

/**
 * Serviço de pipeline: move o estágio de uma empresa e registra o evento.
 * Toda movimentação fica auditável em pipeline_events (RF-14).
 */
export function createPipelineService(deps: {
  companies: CompaniesRepository;
  pipeline: PipelineRepository;
}) {
  return {
    async move(input: {
      companyId: string;
      toStage: PipelineStage;
      reason?: string | null;
      profileId?: string | null;
    }): Promise<CompanyRow> {
      const current = await deps.companies.findById(input.companyId);
      if (!current) throw new Error("Empresa não encontrada.");
      if (current.pipeline_stage === input.toStage) return current;

      // Reabrir estado terminal exige motivo (RN-08).
      if (TERMINAL.includes(current.pipeline_stage) && !input.reason) {
        throw new Error("Reabrir cliente/perdido exige um motivo.");
      }

      const updated = await deps.companies.updateReviewAndStage(
        input.companyId,
        { pipelineStage: input.toStage },
      );
      await deps.pipeline.addEvent({
        companyId: input.companyId,
        fromStage: current.pipeline_stage,
        toStage: input.toStage,
        reason: input.reason ?? null,
        profileId: input.profileId ?? null,
      });
      return updated;
    },
  };
}

export type PipelineService = ReturnType<typeof createPipelineService>;
