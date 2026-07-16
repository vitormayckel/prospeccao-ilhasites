"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { MESSAGE_KIND_LABEL } from "@/lib/message-kind";
import {
  CONTACT_BUCKET_ORDER,
  CONTACT_BUCKET_LABEL,
  CONTACT_BUCKET_HELP,
  contactBucketOf,
  type ContactBucket,
} from "@/lib/contact-board";
import { CONTACT_STAGE_LABEL, nextContactAction } from "@/lib/contact-flow";
import type { ContactBoardRow } from "@/server/repositories/messages-repository";

const bucketVariant: Record<ContactBucket, BadgeProps["variant"]> = {
  awaiting_send: "warning",
  awaiting_reply: "info",
  replied: "accent",
  sent: "success",
  follow_ups: "warning",
  failed: "danger",
  closed: "neutral",
};

type Tab = "all" | ContactBucket;

export function MessagesBoard({ rows }: { rows: ContactBoardRow[] }) {
  const [tab, setTab] = useState<Tab>("all");

  const withBucket = useMemo(
    () => rows.map((r) => ({ row: r, bucket: contactBucketOf(r) })),
    [rows],
  );

  const counts = useMemo(() => {
    const c = {} as Record<ContactBucket, number>;
    for (const b of CONTACT_BUCKET_ORDER) c[b] = 0;
    for (const { bucket } of withBucket) c[bucket] += 1;
    return c;
  }, [withBucket]);

  const visible = withBucket.filter(
    ({ bucket }) => tab === "all" || bucket === tab,
  );

  // Só mostra abas que têm itens — evita filtros vazios.
  const tabs: Tab[] = [
    "all",
    ...CONTACT_BUCKET_ORDER.filter((b) => counts[b] > 0),
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nenhuma abordagem em andamento"
        description="Aprove empresas e inicie o contato para acompanhá-las aqui."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtro por estado">
        {tabs.map((t) => {
          const label = t === "all" ? "Todas" : CONTACT_BUCKET_LABEL[t];
          const count = t === "all" ? rows.length : counts[t];
          const selected = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t)}
              className={
                "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-micro font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 " +
                (selected
                  ? "border-border-strong bg-surface-2 text-text-primary"
                  : "border-border-subtle text-text-muted hover:text-text-secondary")
              }
            >
              {label}
              <span className="tnum text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {tab !== "all" ? (
        <p className="text-micro text-text-muted">{CONTACT_BUCKET_HELP[tab]}</p>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface-1">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle text-micro text-text-muted">
              <th className="px-4 py-2.5 font-medium">Empresa</th>
              <th className="px-4 py-2.5 font-medium">Prévia</th>
              <th className="w-40 px-4 py-2.5 font-medium">Estado</th>
              <th className="w-36 px-4 py-2.5 font-medium">Data</th>
              <th className="w-56 px-4 py-2.5 font-medium">Próxima ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {visible.map(({ row, bucket }) => {
              const action = nextContactAction(row.contact_stage);
              const kindLabel = row.last_message_type
                ? MESSAGE_KIND_LABEL[row.last_message_type]
                : null;
              return (
                <tr key={row.company_id} className="group align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/opportunities/${row.company_id}`}
                      className="block max-w-[26ch] truncate text-meta font-semibold text-text-primary outline-none transition-colors hover:text-accent focus-visible:text-accent"
                    >
                      {row.company_name}
                    </Link>
                    <p className="mt-0.5 text-micro text-text-muted">
                      {[kindLabel, row.company_city].filter(Boolean).join(" · ") ||
                        CONTACT_STAGE_LABEL[row.contact_stage]}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-2 max-w-[42ch] border-l border-border pl-2.5 text-micro leading-relaxed text-text-muted">
                      {row.last_message_content ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={bucketVariant[bucket]} tone="soft">
                      {CONTACT_BUCKET_LABEL[bucket]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-micro text-text-muted">
                    {formatDateTime(row.last_message_at ?? row.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    {action.id === "none" ? (
                      <span className="text-micro text-text-muted">
                        {action.label}
                      </span>
                    ) : (
                      <Link
                        href={`/opportunities/${row.company_id}`}
                        className="inline-flex items-center gap-1 text-micro font-medium text-accent hover:underline"
                      >
                        {action.label}
                        <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
