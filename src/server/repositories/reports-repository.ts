import type { Db } from "@/lib/database/sql";

// Estágios que contam como "abordada" (chegou ao contato).
const APPROACHED_STAGES =
  "('first_contact','follow_up','negotiation','client','lost')";
// Estágios de contato que indicam que o lead respondeu.
const REPLIED_STAGES =
  "('replied','commercial_prepared','commercial_sent','follow_up_scheduled','closed')";

export interface CollectionReport {
  found: number;
  analyzed: number;
  approved: number;
  discarded: number;
}

export interface OperationReport {
  whatsapp: number;
  instagram: number;
  followUps: number;
  replies: number;
}

export interface ConversionReport {
  approached: number;
  replied: number;
  decisionMaker: number;
  proposal: number;
  sale: number;
}

export interface LabeledValue {
  label: string;
  value: number;
}

export interface IntelligenceReport {
  bestSegment: LabeledValue | null;
  topCity: LabeledValue | null;
  bestChannel: { channel: string; rate: number } | null;
  followUps: number;
  mainStage: string | null;
  hasData: boolean;
}

export interface WeeklyReport {
  collection: CollectionReport;
  operation: OperationReport;
  conversion: ConversionReport;
  intelligence: IntelligenceReport;
}

/**
 * Agregações de leitura para a página Relatórios (Sprint 4 §5/§6). Coleta e
 * operação em janela de 7 dias; conversão e inteligência acumuladas (o funil
 * é cumulativo). Nada é inventado — indicadores sem base retornam null e a UI
 * mostra "Dados insuficientes".
 */
export function createReportsRepository(db: Db) {
  return {
    async getWeekly(): Promise<WeeklyReport> {
      const [collection, operation, conversion, intelligence] =
        await Promise.all([
          collectionReport(db),
          operationReport(db),
          conversionReport(db),
          intelligenceReport(db),
        ]);
      return { collection, operation, conversion, intelligence };
    },
  };
}

async function collectionReport(db: Db): Promise<CollectionReport> {
  const rows = await db.query<CollectionReport>(
    `select
       (select count(*)::int from companies
          where deleted_at is null and created_at >= now() - interval '7 days') as found,
       (select count(distinct company_id)::int from ai_analyses
          where status = 'completed' and created_at >= now() - interval '7 days') as analyzed,
       (select count(*)::int from company_decisions
          where decision = 'approved' and created_at >= now() - interval '7 days') as approved,
       (select count(*)::int from company_decisions
          where decision = 'rejected' and created_at >= now() - interval '7 days') as discarded`,
  );
  return rows[0]!;
}

async function operationReport(db: Db): Promise<OperationReport> {
  const rows = await db.query<OperationReport>(
    `select
       (select count(*)::int from companies
          where deleted_at is null and approach_channel = 'whatsapp'
            and pipeline_stage in ${APPROACHED_STAGES}
            and updated_at >= now() - interval '7 days') as whatsapp,
       (select count(*)::int from companies
          where deleted_at is null and approach_channel = 'instagram'
            and pipeline_stage in ${APPROACHED_STAGES}
            and updated_at >= now() - interval '7 days') as instagram,
       (select count(*)::int from follow_ups
          where deleted_at is null and created_at >= now() - interval '7 days') as "followUps",
       (select count(*)::int from companies
          where deleted_at is null and contact_stage in ${REPLIED_STAGES}
            and updated_at >= now() - interval '7 days') as replies`,
  );
  return rows[0]!;
}

async function conversionReport(db: Db): Promise<ConversionReport> {
  const rows = await db.query<ConversionReport>(
    `select
       (select count(*)::int from companies
          where deleted_at is null and pipeline_stage in ${APPROACHED_STAGES}) as approached,
       (select count(*)::int from companies
          where deleted_at is null and contact_stage in ${REPLIED_STAGES}) as replied,
       (select count(*)::int from companies
          where deleted_at is null and contact_role in ('owner','partner','manager')) as "decisionMaker",
       (select count(*)::int from companies
          where deleted_at is null and pipeline_stage in ('negotiation','client')) as proposal,
       (select count(*)::int from companies
          where deleted_at is null and pipeline_stage = 'client') as sale`,
  );
  return rows[0]!;
}

async function intelligenceReport(db: Db): Promise<IntelligenceReport> {
  const [segment, city, channels, followUps, stage] = await Promise.all([
    db.query<LabeledValue>(
      `select primary_category as label, count(*)::int as value
         from companies
         where deleted_at is null and primary_category is not null
           and contact_stage in ${REPLIED_STAGES}
         group by primary_category order by value desc, label asc limit 1`,
    ),
    db.query<LabeledValue>(
      `select city as label, count(*)::int as value
         from companies
         where deleted_at is null and city is not null
           and contact_stage in ${REPLIED_STAGES}
         group by city order by value desc, label asc limit 1`,
    ),
    db.query<{ channel: string; approached: number; sales: number }>(
      `select approach_channel as channel,
              count(*) filter (where pipeline_stage in ${APPROACHED_STAGES})::int as approached,
              count(*) filter (where pipeline_stage = 'client')::int as sales
         from companies where deleted_at is null
         group by approach_channel`,
    ),
    db.query<{ n: number }>(
      `select count(*)::int as n from follow_ups where deleted_at is null`,
    ),
    db.query<LabeledValue>(
      `select pipeline_stage::text as label, count(*)::int as value
         from companies where deleted_at is null
         group by pipeline_stage order by value desc, label asc limit 1`,
    ),
  ]);

  // Melhor canal por taxa de conversão (venda / abordadas), só com base real.
  let bestChannel: { channel: string; rate: number } | null = null;
  for (const c of channels) {
    if (c.approached > 0) {
      const rate = c.sales / c.approached;
      if (!bestChannel || rate > bestChannel.rate) {
        bestChannel = { channel: c.channel, rate };
      }
    }
  }

  const bestSegment = segment[0] ?? null;
  const topCity = city[0] ?? null;
  const mainStage = stage[0]?.label ?? null;
  const followUpCount = followUps[0]?.n ?? 0;

  return {
    bestSegment,
    topCity,
    bestChannel,
    followUps: followUpCount,
    mainStage,
    hasData: Boolean(bestSegment || topCity || bestChannel || followUpCount),
  };
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
