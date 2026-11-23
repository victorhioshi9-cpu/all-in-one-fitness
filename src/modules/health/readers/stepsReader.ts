/**
 * stepsReader.ts
 * ----------------------------------------------------------------------------
 * Lee StepsRecords de Health Connect (escritos por Mi Fitness) para un día.
 * Mi Fitness suele escribir varios records parciales en el día que hay que sumar.
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, sumAccumulables, dedupeBySource } from "../sourceFilter";
import type { HealthRecord } from "../types";

/**
 * @param dayIso 'YYYY-MM-DD'
 * @returns un único HealthRecord con el total de pasos del día.
 */
export async function readStepsForDay(dayIso: string): Promise<HealthRecord | null> {
  const { startMs, endMs } = dayRange(dayIso);
  const raw = await readHcRecords("Steps", startMs, endMs);

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

  // 1) Deduplica entre sources (Mi Fitness + Google Fit + Samsung Health)
  const { unique } = dedupeBySource(records);
  // 2) Suma los parciales del mismo source
  return sumAccumulables(unique);
}

export async function readStepsRange(startDayIso: string, endDayIso: string): Promise<HealthRecord[]> {
  const out: HealthRecord[] = [];
  let cursor = new Date(startDayIso);
  const end = new Date(endDayIso);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const r = await readStepsForDay(iso);
    if (r) out.push(r);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// --- Helper: rango de un día en ms epoch (UTC) -----------------------------
export function dayRange(dayIso: string): { startMs: number; endMs: number } {
  const start = new Date(`${dayIso}T00:00:00Z`).getTime();
  const end = new Date(`${dayIso}T23:59:59.999Z`).getTime();
  return { startMs: start, endMs: end };
}
