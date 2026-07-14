import "server-only";
import { createSupabaseAdminClient } from "@/lib/database/supabase-admin";
import { createCompaniesRepository } from "@/server/repositories/companies-repository";
import { createDecisionsRepository } from "@/server/repositories/decisions-repository";
import { createPipelineRepository } from "@/server/repositories/pipeline-repository";
import { createNotesRepository } from "@/server/repositories/notes-repository";
import { createFollowUpsRepository } from "@/server/repositories/follow-ups-repository";
import { createTemplatesRepository } from "@/server/repositories/templates-repository";
import { createSearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
import { createDashboardRepository } from "@/server/repositories/dashboard-repository";
import { createReviewService } from "@/server/services/review-service";
import { createPipelineService } from "@/server/services/pipeline-service";

/**
 * Composition root do servidor: instancia client, repositories e services.
 * Ponto único de acesso ao domínio a partir de Server Components / Actions.
 */
export function createServerContext(options?: { actorId?: string | null }) {
  const db = createSupabaseAdminClient();

  const companies = createCompaniesRepository(db);
  const decisions = createDecisionsRepository(db);
  const pipeline = createPipelineRepository(db);
  const notes = createNotesRepository(db);
  const followUps = createFollowUpsRepository(db);
  const templates = createTemplatesRepository(db);
  const searchProfiles = createSearchProfilesRepository(db);
  const dashboard = createDashboardRepository(db);

  const review = createReviewService({
    companies,
    decisions,
    pipeline,
    notes,
    actorId: options?.actorId ?? null,
  });
  const pipelineService = createPipelineService({ companies, pipeline });

  return {
    db,
    repositories: {
      companies,
      decisions,
      pipeline,
      notes,
      followUps,
      templates,
      searchProfiles,
      dashboard,
    },
    services: {
      review,
      pipeline: pipelineService,
    },
  };
}

export type ServerContext = ReturnType<typeof createServerContext>;
