import type { AdminClient } from "@/lib/database/supabase-admin";

export interface DashboardSummary {
  pendingReview: number;
  approvedAwaitingMessage: number;
  followUpsDueToday: number;
  followUpsOverdue: number;
  foundLast30Days: number;
  clients: number;
}

export interface MonthlyMetrics {
  found: number;
  approached: number;
  replies: number;
  clients: number;
  conversionRate: number;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/** Consultas agregadas do dashboard (Blueprint RF-15). */
export function createDashboardRepository(db: AdminClient) {
  return {
    async getSummary(): Promise<DashboardSummary> {
      const [
        pendingReview,
        approvedAwaitingMessage,
        foundLast30Days,
        clients,
        dueTodayRes,
        overdueRes,
      ] = await Promise.all([
        db
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("review_status", "pending_review")
          .is("deleted_at", null),
        db
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("pipeline_stage", "approved")
          .is("deleted_at", null),
        db
          .from("companies")
          .select("*", { count: "exact", head: true })
          .gte("created_at", daysAgoIso(30))
          .is("deleted_at", null),
        db
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("pipeline_stage", "client")
          .is("deleted_at", null),
        db
          .from("follow_ups")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("due_at", startOfTodayIso())
          .lte("due_at", endOfTodayIso()),
        db
          .from("follow_ups")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("due_at", startOfTodayIso()),
      ]);

      for (const r of [
        pendingReview,
        approvedAwaitingMessage,
        foundLast30Days,
        clients,
        dueTodayRes,
        overdueRes,
      ]) {
        if (r.error) throw r.error;
      }

      return {
        pendingReview: pendingReview.count ?? 0,
        approvedAwaitingMessage: approvedAwaitingMessage.count ?? 0,
        followUpsDueToday: dueTodayRes.count ?? 0,
        followUpsOverdue: overdueRes.count ?? 0,
        foundLast30Days: foundLast30Days.count ?? 0,
        clients: clients.count ?? 0,
      };
    },

    async getMonthlyMetrics(): Promise<MonthlyMetrics> {
      const since = daysAgoIso(30);
      const [foundRes, approachedRes, clientsRes, repliesRes] =
        await Promise.all([
          db
            .from("companies")
            .select("*", { count: "exact", head: true })
            .gte("created_at", since)
            .is("deleted_at", null),
          db
            .from("companies")
            .select("*", { count: "exact", head: true })
            .in("pipeline_stage", [
              "first_contact",
              "follow_up",
              "negotiation",
              "client",
              "lost",
            ])
            .is("deleted_at", null),
          db
            .from("companies")
            .select("*", { count: "exact", head: true })
            .eq("pipeline_stage", "client")
            .is("deleted_at", null),
          db
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("status", "confirmed_sent"),
        ]);

      for (const r of [foundRes, approachedRes, clientsRes, repliesRes]) {
        if (r.error) throw r.error;
      }

      const approached = approachedRes.count ?? 0;
      const clients = clientsRes.count ?? 0;
      return {
        found: foundRes.count ?? 0,
        approached,
        replies: repliesRes.count ?? 0,
        clients,
        conversionRate: approached > 0 ? clients / approached : 0,
      };
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
