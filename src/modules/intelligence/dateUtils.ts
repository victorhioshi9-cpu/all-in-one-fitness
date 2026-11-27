/**
 * dateUtils.ts - Helpers de fecha locales al timezone del dispositivo.
 * IMPORTANTE: nunca usar toISOString().slice(0,10) para "el día de hoy":
 * eso devuelve la fecha en UTC y en UTC-5 cambia de día a las 7 pm.
 */
export function toLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (new Date(iso) la parsea como UTC). */
export function parseLocalISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toLocalISO(new Date());
}

export function yesterdayISO(): string {
  return daysAgoISO(1);
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISO(d);
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short"
  });
}
