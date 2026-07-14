import type { CompaniesRepository } from "@/server/repositories/companies-repository";
import type { DecisionsRepository } from "@/server/repositories/decisions-repository";
import type { PipelineRepository } from "@/server/repositories/pipeline-repository";
import type { NotesRepository } from "@/server/repositories/notes-repository";
import type { CompanyRow } from "@/types/domain";
import type {
  DecisionInput,
  ReactivateInput,
  SetPriorityInput,
  CreateNoteInput,
} from "@/lib/validation/company";

/**
 * Serviço de revisão humana (Blueprint RF-08/09, RN-01/06/07/08).
 * Só o operador decide; a IA nunca aprova/rejeita (RN-01).
 */
export function createReviewService(deps: {
  companies: CompaniesRepository;
  decisions: DecisionsRepository;
  pipeline: PipelineRepository;
  notes: NotesRepository;
  actorId?: string | null;
}) {
  const actor = deps.actorId ?? null;

  async function requireCompany(id: string): Promise<CompanyRow> {
    const company = await deps.companies.findById(id);
    if (!company) throw new Error("Empresa não encontrada.");
    return company;
  }

  return {
    /** Aprovar: move para pipeline 'approved' e registra decisão + evento. */
    async approve(input: DecisionInput): Promise<CompanyRow> {
      const company = await requireCompany(input.companyId);
      const updated = await deps.companies.updateReviewAndStage(company.id, {
        reviewStatus: "approved",
        pipelineStage: "approved",
      });
      await deps.decisions.add({
        companyId: company.id,
        profileId: actor,
        decision: "approved",
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        previousStatus: company.review_status,
        newStatus: "approved",
      });
      await deps.pipeline.addEvent({
        companyId: company.id,
        fromStage: company.pipeline_stage,
        toStage: "approved",
        reason: input.reason ?? null,
        profileId: actor,
      });
      return updated;
    },

    /** Rejeitar: sai da fila ativa, preserva histórico (RN-06). */
    async reject(input: DecisionInput): Promise<CompanyRow> {
      const company = await requireCompany(input.companyId);
      const updated = await deps.companies.updateReviewAndStage(company.id, {
        reviewStatus: "rejected",
      });
      await deps.decisions.add({
        companyId: company.id,
        profileId: actor,
        decision: "rejected",
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        previousStatus: company.review_status,
        newStatus: "rejected",
      });
      return updated;
    },

    /** Adiar: exige data futura (RN-07); volta às prioridades na data. */
    async snooze(input: DecisionInput): Promise<CompanyRow> {
      if (!input.snoozedUntil) throw new Error("Adiar exige uma data futura.");
      const company = await requireCompany(input.companyId);
      const snoozedIso = input.snoozedUntil.toISOString();
      const updated = await deps.companies.updateReviewAndStage(company.id, {
        reviewStatus: "snoozed",
        nextActionAt: snoozedIso,
      });
      await deps.decisions.add({
        companyId: company.id,
        profileId: actor,
        decision: "snoozed",
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        snoozedUntil: snoozedIso,
        previousStatus: company.review_status,
        newStatus: "snoozed",
      });
      return updated;
    },

    /** Reativar empresa rejeitada/adiada (RN-06/08). */
    async reactivate(input: ReactivateInput): Promise<CompanyRow> {
      const company = await requireCompany(input.companyId);
      const updated = await deps.companies.updateReviewAndStage(company.id, {
        reviewStatus: "pending_review",
        nextActionAt: null,
      });
      await deps.decisions.add({
        companyId: company.id,
        profileId: actor,
        decision: "reactivated",
        reason: input.reason,
        previousStatus: company.review_status,
        newStatus: "pending_review",
      });
      return updated;
    },

    /** Prioridade manual prevalece sobre a recomendação automática (RN-11). */
    async setPriority(input: SetPriorityInput): Promise<CompanyRow> {
      await requireCompany(input.companyId);
      return deps.companies.setPriority(input.companyId, input.priority);
    },

    async addNote(input: CreateNoteInput) {
      await requireCompany(input.companyId);
      return deps.notes.create({
        companyId: input.companyId,
        content: input.content,
        profileId: actor,
      });
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
