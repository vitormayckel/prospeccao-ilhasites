// =====================================================================
// Formatação de datas — ponto ÚNICO da aplicação.
//
// O banco guarda tudo em UTC (timestamptz) e continua assim; o fuso entra
// só na apresentação. Sem `timeZone` explícito, o Intl usa o fuso do
// ambiente: na Vercel o servidor roda em UTC, então todo horário renderizado
// no servidor saía 3 horas adiantado — e ainda divergia do que o navegador
// mostraria depois da hidratação. Fixar o fuso resolve os dois de uma vez.
// =====================================================================

/** Fuso oficial de exibição da aplicação. */
export const APP_TIME_ZONE = "America/Sao_Paulo";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Número do dia no calendário de São Paulo, para comparar DIAS e não
 * durações. `en-CA` produz YYYY-MM-DD, que é o formato estável para isto.
 */
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function diaNoCalendario(date: Date): number {
  const [ano, mes, dia] = DAY_KEY.format(date).split("-").map(Number);
  return Date.UTC(ano!, mes! - 1, dia!) / 86400000;
}

/**
 * Diferença em DIAS DE CALENDÁRIO no fuso de São Paulo.
 *
 * Antes isto era `(due - now) / 86400000` arredondado, que mede duração:
 * um follow-up para daqui a 20 horas caía em "Hoje" mesmo vencendo amanhã, e
 * um de hoje à noite podia virar "Amanhã". "Hoje" tem que significar o mesmo
 * dia no calendário do operador.
 */
function diferencaEmDias(iso: string): number {
  return diaNoCalendario(new Date(iso)) - diaNoCalendario(new Date());
}

/** Hora local de Brasília (HH:MM:SS). */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return TIME.format(typeof iso === "string" ? new Date(iso) : iso);
}

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
  const diffDays = diferencaEmDias(iso);
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
  const diffDays = diferencaEmDias(iso);
  if (diffDays < 0) return `Atrasado (${formatDateTime(iso)})`;
  if (diffDays === 0) return `Hoje (${formatDateTime(iso)})`;
  if (diffDays === 1) return `Amanhã (${formatDateTime(iso)})`;
  return formatDateTime(iso);
}
