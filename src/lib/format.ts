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

/** Rótulo relativo curto para o passado ("há 2 dias", "há 3 h", "agora"). */
export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export interface DueInfo {
  label: string;
  overdue: boolean;
  today: boolean;
}

/**
 * Vencimento em forma compacta, para cards e listas densas onde não cabe a
 * data por extenso. A data completa fica no title/tooltip de quem usa.
 */
export function formatDueCompact(iso: string): DueInfo {
  const diffDays = Math.round(
    (new Date(iso).getTime() - Date.now()) / 86400000,
  );
  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      label: `Atrasado ${days} ${days === 1 ? "dia" : "dias"}`,
      overdue: true,
      today: false,
    };
  }
  if (diffDays === 0) return { label: "Hoje", overdue: false, today: true };
  if (diffDays === 1) return { label: "Amanhã", overdue: false, today: false };
  if (diffDays < 7)
    return { label: `Em ${diffDays} dias`, overdue: false, today: false };
  return { label: formatDate(iso), overdue: false, today: false };
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
