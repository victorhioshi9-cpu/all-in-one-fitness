/**
 * dateUtils.ts - Helpers de fecha locales al timezone del dispositivo.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short"
  });
}
