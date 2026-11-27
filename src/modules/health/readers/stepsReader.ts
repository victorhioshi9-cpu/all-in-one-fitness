/**
 * stepsReader.ts
 * ----------------------------------------------------------------------------
 * Lee StepsRecords de Health Connect (escritos por Mi Fitness) para un día.
 * Mi Fitness suele escribir varios records parciales en el día que hay que sumar.
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, sumAccumulables, dedupeExact, keepPrimarySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { toLocalISO, parseLocalISO } from "@/modules/intelligence/dateUtils";

/**
 * @param dayIso 'YYYY-MM-DD'
 * @returns un único HealthRecord con el total de pasos del día.
 */
export async function readStepsForDay(dayIso: string): Promise<HealthRecord | null> {
  const { startMs, endMs } = dayRange(dayIso);
  // pageSize 5000: por defecto HC devuelve máx. 1000 records y Mi Fitness puede escribir uno por minuto.
  const raw = await readHcRecords("Steps", startMs, endMs, { pageSize: 5000 });

  const records: HealthRecord[] = raw.map((r: any) => ({
    recordType: "Steps",
    sourceApp: extractSourceApp(r),
    day: dayIso,
    startedAt: r.startTime,
    endedAt: r.endTime,
    value: r.count ?? 0,
    unit: "steps",
    rawMeta: r.metadata
  }));

  if (records.length === 0) return null;

  // 1) Una sola fuente (la del reloj si existe) → nunca se mezclan relojes/teléfono.
  // 2) Solo se eliminan duplicados EXACTOS y se suma el resto (ver dedupeExact).
  const unique = dedupeExact(keepPrimarySource(records));
  return sumAccumulables(unique);
}

export async function readStepsRange(startDayIso: string, endDayIso: string): Promise<HealthRecord[]> {
  const out: HealthRecord[] = [];
  let cursor = parseLocalISO(startDayIso);
  const end = parseLocalISO(endDayIso);
  while (cursor <= end) {
    const iso = toLocalISO(cursor);
    const r = await readStepsForDay(iso);
    if (r) out.push(r);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// --- Helper: rango de un día en ms epoch (LOCAL timezone) -------------------
// IMPORTANTE: Usar zona horaria local, NO UTC. Si el usuario está en UTC-5
// y son las 10pm, en UTC ya es el día siguiente. Usar UTC haría que los datos
// de la tarde no aparezcan.
export function dayRange(dayIso: string): { startMs: number; endMs: number } {
  // Parsear la fecha como local (no UTC).
  const [year, month, day] = dayIso.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return { startMs: start, endMs: end };
}
