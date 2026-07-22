import type { Db } from "@/lib/database/sql";
import type { ContactStage } from "@/types/domain";

/** Contas compactas do topo do dashboard (§4). */
export interface QueueSummary {
  toApproach: number;
  awaitingReply: number;
  replied: number;
  followUpsToday: number;
  overdue: number;
  reviewPending: number;
}

export type QueueActionKind =
  | "follow_up_overdue"
  | "follow_up_today"
  | "reply_awaiting_commercial"
  | "message_awaiting_send"
  | "greeting_pending"
  | "review_pending"
  | "search_alert";

export interface TodayQueueItem {
  kind: QueueActionKind;
  rank: number;
  company_id: string | null;
  company_name: string;
  contact_stage: ContactStage | null;
  phone_e164: string | null;
  phone_raw: string | null;
  score: number | null;
  due_at: string | null;
  reason: string | null;
  follow_up_id: string | null;
  message_id: string | null;
}

/** Início do dia atual no fuso America/Sao_Paulo, como timestamptz. */
const SP_DAY_START =
  "(date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')";

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
          -- SP_DAY_START e não date_trunc('day', now()): a sessão do Postgres
          -- roda em UTC, então o corte do dia caía 3h adiantado e um
          -- follow-up do fim da tarde já contava como "atrasado".
          (select count(*)::int from follow_ups
             where status = 'pending' and deleted_at is null
               and due_at >= ${SP_DAY_START}
               and due_at < ${SP_DAY_START} + interval '1 day') as "followUpsDueToday",
          (select count(*)::int from follow_ups
             where status = 'pending' and deleted_at is null
               and due_at < ${SP_DAY_START}) as "followUpsOverdue",
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

    /** Contadores compactos do topo do dashboard (§4), fuso America/Sao_Paulo. */
    async getQueueSummary(): Promise<QueueSummary> {
      const rows = await db.query<Record<keyof QueueSummary, number>>(
        `with tz as (select ${SP_DAY_START} as day_start)
         select
           (select count(*)::int from companies
              where deleted_at is null and review_status = 'approved'
                and contact_stage = 'not_started') as "toApproach",
           (select count(*)::int from companies
              where deleted_at is null and contact_stage = 'awaiting_reply') as "awaitingReply",
           (select count(*)::int from companies
              where deleted_at is null and contact_stage = 'replied') as "replied",
           (select count(*)::int from follow_ups f, tz
              where f.status = 'pending' and f.deleted_at is null
                and f.due_at >= tz.day_start
                and f.due_at < tz.day_start + interval '1 day') as "followUpsToday",
           (select count(*)::int from follow_ups f, tz
              where f.status = 'pending' and f.deleted_at is null
                and f.due_at < tz.day_start) as "overdue",
           (select count(*)::int from companies
              where deleted_at is null and review_status = 'pending_review') as "reviewPending"`,
      );
      return rows[0]!;
    },

    /**
     * Fila de Hoje (§4): checklist operacional priorizado, com dados reais,
     * fuso America/Sao_Paulo, uma entrada por empresa (deduplicada pela ação
     * de maior prioridade). Alertas de coleta não têm empresa e nunca somem.
     */
    async getTodayQueue(): Promise<TodayQueueItem[]> {
      const rows = await db.query<TodayQueueItem & { sort_at: string | null }>(
        `with tz as (select ${SP_DAY_START} as day_start)
         select
           case when f.due_at < tz.day_start then 'follow_up_overdue'
                else 'follow_up_today' end as kind,
           case when f.due_at < tz.day_start then 1 else 2 end as rank,
           c.id as company_id, c.name as company_name, c.contact_stage,
           c.phone_e164, c.phone_raw, c.score,
           f.due_at, f.notes as reason, f.id as follow_up_id,
           null::uuid as message_id, f.due_at as sort_at
         from follow_ups f
         join companies c on c.id = f.company_id
         cross join tz
         where f.status = 'pending' and f.deleted_at is null and c.deleted_at is null
           and f.due_at < tz.day_start + interval '1 day'

         union all
         select 'reply_awaiting_commercial', 3, c.id, c.name, c.contact_stage,
           c.phone_e164, c.phone_raw, c.score,
           null::timestamptz, null, null::uuid, null::uuid, c.updated_at
         from companies c
         where c.deleted_at is null and c.contact_stage = 'replied'

         union all
         select 'message_awaiting_send', 4, c.id, c.name, c.contact_stage,
           c.phone_e164, c.phone_raw, c.score,
           null::timestamptz, null, null::uuid, m.id, c.updated_at
         from companies c
         left join lateral (
           select id from messages mm
           where mm.company_id = c.id and mm.status = 'opened'
           order by coalesce(mm.opened_at, mm.created_at) desc limit 1
         ) m on true
         where c.deleted_at is null
           and c.contact_stage in ('greeting_prepared', 'commercial_prepared')

         union all
         select 'greeting_pending', 5, c.id, c.name, c.contact_stage,
           c.phone_e164, c.phone_raw, c.score,
           null::timestamptz, null, null::uuid, null::uuid, c.updated_at
         from companies c
         where c.deleted_at is null and c.review_status = 'approved'
           and c.contact_stage = 'not_started'

         union all
         select 'review_pending', 6, c.id, c.name, null::contact_stage,
           c.phone_e164, c.phone_raw, c.score,
           null::timestamptz, null, null::uuid, null::uuid, c.created_at
         from companies c
         where c.deleted_at is null and c.review_status = 'pending_review'

         union all
         select 'search_alert', 7, null::uuid, coalesce(sp.name, 'Busca'),
           null::contact_stage, null, null, null::int,
           null::timestamptz, r.error_message, null::uuid, null::uuid,
           coalesce(r.finished_at, r.created_at)
         from search_runs r
         left join search_profiles sp on sp.id = r.search_profile_id
         where r.status in ('failed', 'partial')
           and coalesce(r.finished_at, r.created_at) >= now() - interval '7 days'

         order by rank asc, sort_at asc nulls last`,
      );

      // Dedup por empresa: mantém a ação de maior prioridade (menor rank).
      const seen = new Set<string>();
      const out: TodayQueueItem[] = [];
      for (const r of rows) {
        if (r.company_id) {
          if (seen.has(r.company_id)) continue;
          seen.add(r.company_id);
        }
        out.push(r);
      }
      return out;
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
