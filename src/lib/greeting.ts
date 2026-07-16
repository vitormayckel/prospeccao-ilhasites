// =====================================================================
// Saudação por horário (regra central §2). Curta e humana.
// "Bom dia!" < 12h · "Boa tarde!" 12h–18h · "Olá!" após 18h ou sem certeza.
// Puro e sem efeitos — usável no servidor e no cliente.
// =====================================================================

const DEFAULT_TZ = "America/Sao_Paulo";

/** Hora (0–23) no fuso informado, ou null se não for possível determinar. */
function hourIn(now: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    });
    const hour = Number(fmt.format(now));
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

/**
 * Sugere a saudação de acordo com o horário. Sem certeza sobre o horário,
 * cai no neutro "Olá!". O operador pode editar antes de abrir o WhatsApp.
 */
export function suggestGreeting(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): string {
  const hour = hourIn(now, timeZone);
  if (hour === null) return "Olá!";
  if (hour < 12) return "Bom dia!";
  if (hour < 18) return "Boa tarde!";
  return "Olá!";
}
