/**
 * dateUtils.ts — corregido para usar timezone LOCAL, no UTC.
 * Originalmente usaba toISOString().slice(0,10) que cambia de día a las 7pm
 * en UTC-5. Ahora usa getFullYear/getMonth/getDate que respeta la zona local.
 */

/** Devuelve 'YYYY-MM-DD' en timezone LOCAL (no UTC). */
export function todayISO(): string {
  return dayToLocalISO(new Date());
}

/** Convierte un Date a 'YYYY-MM-DD' en timezone local. */
export function dayToLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convierte un string ISO o número epoch a ms epoch (número). */
export function toMs(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = new Date(v);
    const ms = d.getTime();
    if (!isNaN(ms)) return ms;
  }
  return 0;
}

/** Devuelve el día anterior a hoyISO en formato 'YYYY-MM-DD'. */
export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayToLocalISO(d);
}

/** Formatea ms epoch a 'HH:mm' en timezone local. */
export function msToLocalTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}
