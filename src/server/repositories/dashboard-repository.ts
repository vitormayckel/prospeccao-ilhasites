import type { Db } from "@/lib/database/sql";

export interface DashboardSummary {
  pendingReview: number;
  pendingAnalysis: number;
  approvedAwaitingMessage: number;
  followUpsDueToday: number;
  followUpsOverdue: number;
  foundLast30Days: number;
  clients: number;
}

export interface SearchAlert {
  run_id: string;
  profile_id: string | null;
  profile_name: string | null;
  status: string;
  error_message: string | null;
  finished_at: string | null;
}

export interface MonthlyMetrics {
  found: number;
  approached: number;
  replies: number;
  clients: number;
  conversionRate: number;
}

export type PriorityKind = "follow_up" | "approach" | "review";
export interface PriorityItem {
  kind: PriorityKind;
  company_id: string;
  company: string;
  detail: string;
}

export interface LatestSearch {
  profile_name: string | null;
  status: string;
  new_companies: number;
  finished_at: string | null;
  city: string | null;
}

export function createDashboardRepository(db: Db) {
  return {
    async getSummary(): Promise<DashboardSummary> {
      const rows = await db.query<Record<keyof DashboardSummary, number>>(
        `select
          (select count(*)::int from companies
             where review_status = 'pending_review' and deleted_at is null) as "pendingReview",
          (select count(*)::int from companies
             where review_status = 'pending_analysis' and deleted_at is null) as "pendingAnalysis",
          (select count(*)::int from companies
             where pipeline_stage = 'approved' and deleted_at is null) as "approvedAwaitingMessage",
          (select count(*)::int from follow_ups
             where status = 'pending' and deleted_at is null
               and due_at >= date_trunc('day', now())
               and due_at < date_trunc('day', now()) + interval '1 day') as "followUpsDueToday",
          (select count(*)::int from follow_ups
             where status = 'pending' and deleted_at is null
               and due_at < date_trunc('day', now())) as "followUpsOverdue",
          (select count(*)::int from companies
             where created_at >= now() - interval '30 days' and deleted_at is null) as "foundLast30Days",
          (select count(*)::int from companies
             where pipeline_stage = 'client' and deleted_at is null) as "clients"`,
      );
      return rows[0]!;
    },

    async getMonthlyMetrics(): Promise<MonthlyMetrics> {
      // Estágios "abordados" são constantes controladas (não entrada do usuário).
      const rows = await db.query<{
        found: number;
        approached: number;
        replies: number;
        clients: number;
      }>(
        `select
          (select count(*)::int from companies
             where created_at >= now() - interval '30 days' and deleted_at is null) as found,
          (select count(*)::int from companies
             where pipeline_stage in ('first_contact','follow_up','negotiation','client','lost')
               and deleted_at is null) as approached,
          (select count(*)::int from messages
             where status = 'confirmed_sent') as replies,
          (select count(*)::int from companies
             where pipeline_stage = 'client' and deleted_at is null) as clients`,
      );
      const r = rows[0]!;
      return {
        ...r,
        conversionRate: r.approached > 0 ? r.clients / r.approached : 0,
      };
    },

    async getPriorities(): Promise<PriorityItem[]> {
      return db.query<PriorityItem>(
        `(select 'follow_up' as kind, c.id as company_id, c.name as company,
                 'Follow-up ' || to_char(f.due_at, 'DD/MM HH24:MI') as detail,
                 f.due_at as sort_at
            from follow_ups f
            join companies c on c.id = f.company_id
            where f.status = 'pending' and f.deleted_at is null)
         union all
         (select 'approach', c.id, c.name,
                 'Aprovada — primeira abordagem pendente', c.updated_at
            from companies c
            where c.pipeline_stage = 'approved' and c.deleted_at is null)
         union all
         (select 'review', c.id, c.name,
                 'Score ' || coalesce(c.score::text, '—') || ' — aguardando revisão',
                 c.created_at
            from companies c
            where c.review_status = 'pending_review' and c.deleted_at is null)
         order by sort_at asc
         limit 8`,
      );
    },

    /** Buscas com falha/parciais recentes — alerta acionável (§10.5/RF-15). */
    async getSearchAlerts(): Promise<SearchAlert[]> {
      return db.query<SearchAlert>(
        `select r.id as run_id, r.search_profile_id as profile_id,
                sp.name as profile_name, r.status, r.error_message, r.finished_at
           from search_runs r
           left join search_profiles sp on sp.id = r.search_profile_id
           where r.status in ('failed', 'partial')
             and coalesce(r.finished_at, r.created_at) >= now() - interval '7 days'
           order by coalesce(r.finished_at, r.created_at) desc
           limit 5`,
      );
    },

    async getLatestSearch(): Promise<LatestSearch | null> {
      const rows = await db.query<LatestSearch>(
        `select sp.name as profile_name, r.status, r.new_companies, r.finished_at,
                (select l.city from search_profile_locations l
                   where l.search_profile_id = sp.id order by l.created_at limit 1) as city
           from search_runs r
           left join search_profiles sp on sp.id = r.search_profile_id
           order by coalesce(r.finished_at, r.started_at, r.created_at) desc
           limit 1`,
      );
      return rows[0] ?? null;
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
