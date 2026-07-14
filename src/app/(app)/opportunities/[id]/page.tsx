import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Globe, Instagram, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge } from "@/features/opportunities/components/score-badge";
import { DecisionBar } from "@/features/opportunities/components/detail/decision-bar";
import { AddNoteForm } from "@/features/opportunities/components/detail/add-note-form";
import { AddFollowUpForm } from "@/features/opportunities/components/detail/add-follow-up-form";
import { AnalyzeButton } from "@/features/opportunities/components/detail/analyze-button";
import { AnalysisPanel } from "@/features/opportunities/components/detail/analysis-panel";
import {
  priorityLabel,
  priorityVariant,
  reviewStatusLabel,
  pipelineStageLabel,
} from "@/features/opportunities/labels";
import { formatDateTime, formatDueLabel } from "@/lib/format";
import { createServerContext } from "@/server/context";
import type { ProspectAnalysis } from "@/types/domain";

export const dynamic = "force-dynamic";

const whatsappLabel: Record<string, string> = {
  unknown: "não verificado",
  probable: "provável",
  confirmed: "confirmado",
  invalid: "inválido",
};

function Contact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-text-primary">{value}</p>
      </div>
    </div>
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { repositories } = await createServerContext();
  const detail = await repositories.companies.getDetail(params.id);
  if (!detail) notFound();

  const { company, analyses, notes, followUps, pipelineEvents } = detail;
  const analysis = analyses.find((a) => a.status === "completed");
  const output = analysis?.output as ProspectAnalysis | null | undefined;
  const lastAnalysis = analyses[0];
  const analysisFailed =
    company.review_status === "analysis_failed" ||
    lastAnalysis?.status === "failed";

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/opportunities">
          <ArrowLeft />
          Voltar para oportunidades
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {company.name}
          </h1>
          <p className="text-sm text-text-secondary">
            {[company.primary_category, company.city]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="info">
              {reviewStatusLabel[company.review_status]}
            </Badge>
            <Badge variant="neutral">
              {pipelineStageLabel[company.pipeline_stage]}
            </Badge>
            <Badge variant={priorityVariant[company.priority]}>
              {priorityLabel[company.priority]}
            </Badge>
            {company.score !== null ? (
              <ScoreBadge score={company.score} />
            ) : null}
          </div>
        </div>
        <DecisionBar
          companyId={company.id}
          reviewStatus={company.review_status}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Análise */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Análise comercial</CardTitle>
              <AnalyzeButton companyId={company.id} hasAnalysis={!!output} />
            </CardHeader>
            <CardContent>
              {output ? (
                <AnalysisPanel output={output} />
              ) : (
                <EmptyState
                  title={
                    analysisFailed
                      ? "Falha na análise"
                      : "Sem análise concluída"
                  }
                  description={
                    analysisFailed
                      ? (lastAnalysis?.error_message ??
                        "A análise falhou. Você pode reprocessar.")
                      : "Esta empresa ainda não possui uma análise de IA concluída."
                  }
                  className="border-none py-8"
                />
              )}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pipelineEvents.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState
                    title="Sem movimentações"
                    className="border-none py-8"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {pipelineEvents.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <span className="text-text-primary">
                        {e.from_stage
                          ? `${pipelineStageLabel[e.from_stage]} → ${pipelineStageLabel[e.to_stage]}`
                          : pipelineStageLabel[e.to_stage]}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatDateTime(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Contatos */}
          <Card>
            <CardHeader>
              <CardTitle>Contatos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Contact
                icon={Phone}
                label={`WhatsApp ${whatsappLabel[company.whatsapp_status] ?? ""}`}
                value={company.phone_raw ?? company.phone_e164 ?? "—"}
              />
              <Contact
                icon={Globe}
                label="Website"
                value={company.website_url ?? "não localizado"}
              />
              {company.instagram_url ? (
                <Contact
                  icon={Instagram}
                  label="Instagram"
                  value={company.instagram_url}
                />
              ) : null}
              <Contact
                icon={MapPin}
                label="Endereço"
                value={
                  [company.address_line, company.city, company.state]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              {company.rating !== null ? (
                <Contact
                  icon={Star}
                  label="Avaliação"
                  value={`${company.rating} (${company.reviews_count ?? 0})`}
                />
              ) : null}
            </CardContent>
          </Card>

          {/* Follow-ups */}
          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddFollowUpForm companyId={company.id} />
              {followUps.length > 0 ? (
                <ul className="space-y-2 border-t border-border-subtle pt-3">
                  {followUps.map((f) => (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-primary">
                          {formatDueLabel(f.due_at)}
                        </span>
                        <Badge
                          variant={
                            f.status === "completed" ? "success" : "warning"
                          }
                        >
                          {f.status === "completed" ? "concluído" : "pendente"}
                        </Badge>
                      </div>
                      {f.notes ? (
                        <p className="text-xs text-text-muted">{f.notes}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {/* Notas */}
          <Card>
            <CardHeader>
              <CardTitle>Notas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddNoteForm companyId={company.id} />
              {notes.length > 0 ? (
                <ul className="space-y-3 border-t border-border-subtle pt-3">
                  {notes.map((n) => (
                    <li key={n.id} className="text-sm">
                      <p className="text-text-secondary">{n.content}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatDateTime(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
