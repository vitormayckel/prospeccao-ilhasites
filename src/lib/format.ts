const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_TIME.format(new Date(iso));
}

/** Rótulo relativo curto para vencimentos (hoje, atrasado, em N dias). */
export function formatDueLabel(iso: string): string {
  const due = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.round((due - now) / 86400000);
  if (diffDays < 0) return `Atrasado (${formatDateTime(iso)})`;
  if (diffDays === 0) return `Hoje (${formatDateTime(iso)})`;
  if (diffDays === 1) return `Amanhã (${formatDateTime(iso)})`;
  return formatDateTime(iso);
}
