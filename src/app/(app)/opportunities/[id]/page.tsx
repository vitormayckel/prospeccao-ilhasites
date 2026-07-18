import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Globe, Instagram, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { ScoreHeadline } from "@/features/opportunities/components/score-badge";
import { DecisionBar } from "@/features/opportunities/components/detail/decision-bar";
import { AddNoteForm } from "@/features/opportunities/components/detail/add-note-form";
import { AddFollowUpForm } from "@/features/opportunities/components/detail/add-follow-up-form";
import { CompleteFollowUpButton } from "@/features/opportunities/components/detail/complete-follow-up-button";
import { AnalyzeButton } from "@/features/opportunities/components/detail/analyze-button";
import { AnalysisPanel } from "@/features/opportunities/components/detail/analysis-panel";
import { Timeline } from "@/features/opportunities/components/detail/timeline";
import { CommercialControls } from "@/features/opportunities/components/detail/commercial-controls";
import { buildTimeline } from "@/features/opportunities/lib/build-timeline";
import { ContactFlow } from "@/features/opportunities/components/detail/contact-flow";
import {
  priorityLabel,
  priorityVariant,
  reviewStatusLabel,
  reviewStatusTone,
  pipelineStageLabel,
} from "@/features/opportunities/labels";
import { formatDateTime, formatDueLabel, formatDueCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createServerContext } from "@/server/context";
import { suggestGreeting } from "@/lib/greeting";
import { buildCommercialSuggestion, canStartContact } from "@/lib/contact-flow";
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
    <div className="flex items-start gap-3">
      <Icon
        className="mt-0.5 size-3.5 shrink-0 text-text-muted"
        strokeWidth={1.75}
      />
      <div className="min-w-0">
        <p className="text-micro text-text-muted">{label}</p>
        <p className="break-words text-meta text-text-primary">{value}</p>
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

  const { company, analyses, notes, followUps, messages } = detail;
  const timeline = buildTimeline(detail);
  const analysis = analyses.find((a) => a.status === "completed");
  const output = analysis?.output as ProspectAnalysis | null | undefined;
  const lastAnalysis = analyses[0];
  const analysisFailed =
    company.review_status === "analysis_failed" ||
    lastAnalysis?.status === "failed";

  const lastMessage = messages[0];
  const suggestedGreeting = suggestGreeting();
  const suggestedCommercial = buildCommercialSuggestion(company, output ?? null);
  const greetingMessageId =
    messages.find((m) => m.type === "greeting" && m.status === "opened")?.id ??
    null;
  const commercialMessageId =
    messages.find((m) => m.type === "first_contact" && m.status === "opened")
      ?.id ?? null;
  const contactPhone = company.phone_e164 ?? company.phone_raw ?? null;
  const showContactFlow = canStartContact(company);
  const messageStatusLabel: Record<string, string> = {
    draft: "rascunho",
    opened: "aberta (não confirmada)",
    confirmed_sent: "enviada",
    not_sent: "não enviada",
  };

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/opportunities">
          <ArrowLeft />
          Voltar para oportunidades
        </Link>
      </Button>

      {/*
       * Identidade primeiro, estado depois: o nome sozinho no topo, e os
       * quatro atributos de estado numa única linha de apoio — antes eram
       * quatro badges coloridas disputando atenção com o título.
       */}
      <div className="flex flex-col gap-6 border-b border-border-subtle pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2.5">
          <p className="eyebrow">
            {pipelineStageLabel[company.pipeline_stage]}
          </p>
          {/* Mesmo degrau do PageHeader: o nome da empresa é o título desta
           * página, e a escala precisa ser consistente entre telas. */}
          <h1 className="text-display text-text-primary">{company.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-text-secondary">
            <span>
              {[company.primary_category, company.city]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
            <span aria-hidden className="text-text-muted/50">
              ·
            </span>
            <span className="inline-flex items-center gap-2">
              <StatusDot tone={reviewStatusTone[company.review_status]} />
              {reviewStatusLabel[company.review_status]}
            </span>
            {company.priority === "high" || company.priority === "urgent" ? (
              <Badge variant={priorityVariant[company.priority]}>
                {priorityLabel[company.priority]}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-6 sm:flex-row sm:items-end sm:gap-8">
          {company.score !== null ? (
            <ScoreHeadline score={company.score} />
          ) : null}
          <DecisionBar
            companyId={company.id}
            reviewStatus={company.review_status}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Análise */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Análise comercial</CardTitle>
              <AnalyzeButton companyId={company.id} hasAnalysis={!!output} />
            </CardHeader>
            <CardContent>
              {output ? (
                <AnalysisPanel output={output} />
              ) : (
                <EmptyState
                  variant="inline"
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
                />
              )}
            </CardContent>
          </Card>

          {/* Histórico — timeline cronológico (Sprint 4) */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState variant="inline" title="Sem movimentações" />
              ) : (
                <Timeline events={timeline} />
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

          {/* Operação comercial — classificação (Sprint 4 §2/§3/§4) */}
          <Card>
            <CardHeader>
              <CardTitle>Operação comercial</CardTitle>
            </CardHeader>
            <CardContent>
              <CommercialControls
                companyId={company.id}
                approachChannel={company.approach_channel}
                contactRole={company.contact_role}
                nextActionStatus={company.next_action_status}
              />
            </CardContent>
          </Card>

          {/* Abordagem (WhatsApp manual, saudação primeiro — §1) */}
          <Card>
            <CardHeader>
              <CardTitle>Abordagem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {showContactFlow ? (
                <ContactFlow
                  companyId={company.id}
                  phone={contactPhone}
                  contactStage={company.contact_stage}
                  suggestedGreeting={suggestedGreeting}
                  suggestedCommercial={suggestedCommercial}
                  greetingMessageId={greetingMessageId}
                  commercialMessageId={commercialMessageId}
                />
              ) : (
                <p className="text-sm text-text-muted">
                  Aprove a empresa para iniciar o contato — a primeira mensagem é
                  só uma saudação curta.
                </p>
              )}
              {lastMessage ? (
                <p className="text-micro text-text-muted">
                  Última mensagem: {messageStatusLabel[lastMessage.status]} ·{" "}
                  {formatDateTime(
                    lastMessage.sent_at ??
                      lastMessage.opened_at ??
                      lastMessage.created_at,
                  )}
                </p>
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
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {followUps.map((f) => {
                    const due = formatDueCompact(f.due_at);
                    const pending = f.status === "pending";
                    return (
                      <li key={f.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            title={formatDueLabel(f.due_at)}
                            className={cn(
                              "min-w-0 truncate text-meta",
                              !pending
                                ? "text-text-muted line-through"
                                : due.overdue
                                  ? "font-medium text-danger"
                                  : "text-text-primary",
                            )}
                          >
                            {due.label}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {pending ? (
                              <CompleteFollowUpButton followUpId={f.id} />
                            ) : (
                              <Badge variant="success" tone="quiet">
                                concluído
                              </Badge>
                            )}
                          </div>
                        </div>
                        {f.notes ? (
                          <p className="mt-1 text-micro text-text-muted">
                            {f.notes}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
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
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {notes.map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="text-meta leading-relaxed text-text-secondary">
                        {n.content}
                      </p>
                      <p className="mt-1 text-micro text-text-muted">
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
