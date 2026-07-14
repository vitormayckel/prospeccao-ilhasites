import "server-only";
import { getDb } from "@/lib/database";
import { createCompaniesRepository } from "@/server/repositories/companies-repository";
import { createDecisionsRepository } from "@/server/repositories/decisions-repository";
import { createPipelineRepository } from "@/server/repositories/pipeline-repository";
import { createNotesRepository } from "@/server/repositories/notes-repository";
import { createFollowUpsRepository } from "@/server/repositories/follow-ups-repository";
import { createTemplatesRepository } from "@/server/repositories/templates-repository";
import { createSearchProfilesRepository } from "@/server/repositories/search-profiles-repository";
import { createDashboardRepository } from "@/server/repositories/dashboard-repository";
import { createMessagesRepository } from "@/server/repositories/messages-repository";
import { createIntegrationsRepository } from "@/server/repositories/integrations-repository";
import { createProfilesRepository } from "@/server/repositories/profiles-repository";
import { createCollectionRepository } from "@/server/repositories/collection-repository";
import { createReviewService } from "@/server/services/review-service";
import { createPipelineService } from "@/server/services/pipeline-service";
import { createCollectionService } from "@/server/services/collection-service";

/**
 * Composition root do servidor: resolve o banco e instancia
 * repositories e services. Ponto único de acesso ao domínio a partir
 * de Server Components e Server Actions.
 */
export async function createServerContext(options?: {
  actorId?: string | null;
}) {
  const db = await getDb();

  const companies = createCompaniesRepository(db);
  const decisions = createDecisionsRepository(db);
  const pipeline = createPipelineRepository(db);
  const notes = createNotesRepository(db);
  const followUps = createFollowUpsRepository(db);
  const templates = createTemplatesRepository(db);
  const searchProfiles = createSearchProfilesRepository(db);
  const dashboard = createDashboardRepository(db);
  const messages = createMessagesRepository(db);
  const integrations = createIntegrationsRepository(db);
  const profiles = createProfilesRepository(db);
  const collection = createCollectionRepository(db);

  const review = createReviewService({
    companies,
    decisions,
    pipeline,
    notes,
    actorId: options?.actorId ?? null,
  });
  const pipelineService = createPipelineService({ companies, pipeline });
  const collectionService = createCollectionService({
    searchProfiles,
    collection,
  });

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
      messages,
      integrations,
      profiles,
      collection,
    },
    services: {
      review,
      pipeline: pipelineService,
      collection: collectionService,
    },
  };
}

export type ServerContext = Awaited<ReturnType<typeof createServerContext>>;
