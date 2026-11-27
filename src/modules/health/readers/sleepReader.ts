/**
 * sleepReader.ts
 * ----------------------------------------------------------------------------
 * Lee SleepSessionRecord de HC. Mi Fitness escribe sesiones de sueño con
 * clasificación por etapa (light/deep/rem/awake) cuando el reloj lo detecta.
 *
 * Devuelve:
 *   - Duración total en cama (rango sesión)
 *   - Tiempo dormido (suma de etapas light+deep+rem)
 *   - Desglose por etapa
 *   - Hora de inicio / fin
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, dedupeBySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { dayRange } from "./stepsReader";

export interface SleepSummary {
  day: string;                // día de despertar (ISO)
  startTime: number;
  endTime: number;
  inBedMs: number;
  asleepMs: number;
  lightMs: number;
  deepMs: number;
  remMs: number;
  awakeMs: number;
  sourceApp?: string;
  /** Sleep efficiency 0..1 (asleep / inBed) */
  efficiency: number;
}

const STAGE_TO_FIELD: Record<string, keyof SleepSummary> = {
  "STAGE_TYPE_LIGHT": "lightMs",
  "STAGE_TYPE_DEEP": "deepMs",
  "STAGE_TYPE_REM": "remMs",
  "STAGE_TYPE_AWAKE": "awakeMs",
  "STAGE_TYPE_OUT_OF_BED": "awakeMs",
  "STAGE_TYPE_SLEEPING": "asleepMs"
};

// HC v3.x devuelve la etapa como número (enum SleepStageType).
const NUM_STAGE: Record<number, string> = {
  1: "STAGE_TYPE_AWAKE",
  2: "STAGE_TYPE_SLEEPING",
  3: "STAGE_TYPE_OUT_OF_BED",
  4: "STAGE_TYPE_LIGHT",
  5: "STAGE_TYPE_DEEP",
  6: "STAGE_TYPE_REM",
  7: "STAGE_TYPE_AWAKE"
};

/**
 * Lee el sueño "de anoche": la SleepSession que termina hoy.
 * HC suele escribir la sesión completa al despertar; por eso consultamos
 * el día de "despertar" (hoy) pero abrimos la ventana desde ayer 18:00.
 */
export async function readSleepForDay(wokeDayIso: string): Promise<SleepSummary | null> {
  const [y, m, d] = wokeDayIso.split("-").map(Number);
  const wokeDay = new Date(y, m - 1, d, 0, 0, 0, 0);
  const startMs = wokeDay.getTime() - 6 * 3600_000; // ayer 18:00 local
  const endMs = wokeDay.getTime() + 24 * 3600_000 - 1; // hoy 23:59 local

  const raw = await readHcRecords("SleepSession", startMs, endMs);
  if (raw.length === 0) return null;

  // Aplanar a HealthRecord-like para dedupe.
  // startTime/endTime en HC v3.2 son strings ISO, hay que parsearlas a ms.
  const recs: HealthRecord[] = raw.map((r: any) => {
    const startMsVal = new Date(r.startTime).getTime();
    const endMsVal = new Date(r.endTime).getTime();
    return {
      recordType: "SleepSession",
      sourceApp: extractSourceApp(r),
      startedAt: startMsVal,
      endedAt: endMsVal,
      value: endMsVal - startMsVal,
      unit: "ms",
      rawMeta: r.metadata
    };
  });
  const { unique } = dedupeBySource(recs);

  if (unique.length === 0) return null;

  // Tomamos la sesión más larga (puede haber siestas cortas)
  const sorted = unique.slice().sort((a, b) => b.value - a.value);
  const main = sorted[0];
  const mainRaw = raw.find((r: any) =>
    new Date(r.startTime).getTime() === main.startedAt && new Date(r.endTime).getTime() === main.endedAt
  );

  const summary: SleepSummary = {
    day: wokeDayIso,
    startTime: main.startedAt,
    endTime: main.endedAt ?? main.startedAt,
    inBedMs: main.value,
    asleepMs: 0,
    lightMs: 0,
    deepMs: 0,
    remMs: 0,
    awakeMs: 0,
    sourceApp: main.sourceApp,
    efficiency: 0
  };

  // Procesar stages
  const stages = mainRaw?.stages ?? [];
  for (const stage of stages) {
    const dur = Math.max(0, (Number(stage.endTime) || 0) - (Number(stage.startTime) || 0));
    const stageKey = typeof stage.stage === "number" ? (NUM_STAGE[stage.stage] ?? "") : (stage.stage ?? "");
    const field = STAGE_TO_FIELD[stageKey] ?? STAGE_TO_FIELD["STAGE_TYPE_SLEEPING"];
    if (field === "asleepMs") {
      // Si es genérico SLEEPING, suma a asleepMs pero no a light/deep/rem
      summary.asleepMs += dur;
    } else {
      (summary[field] as number) += dur;
      if (field !== "awakeMs") summary.asleepMs += dur;
    }
  }

  // Si la sesión no tiene stages detallados, asumimos que todo el tiempo en cama es asleep
  if (summary.asleepMs === 0 && summary.inBedMs > 0) {
    summary.asleepMs = summary.inBedMs - summary.awakeMs;
  }

  summary.efficiency = summary.inBedMs > 0
    ? Math.max(0, Math.min(1, summary.asleepMs / summary.inBedMs))
    : 0;

  return summary;
}
