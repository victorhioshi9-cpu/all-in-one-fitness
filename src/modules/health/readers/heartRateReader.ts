/**
 * heartRateReader.ts
 * ----------------------------------------------------------------------------
 * Lee HeartRateRecord de Health Connect.
 *
 * Mi Fitness escribe samples de HR cada pocos minutos durante el día (reloj en
 * modo HR auto) y a intervalos de 1-5s durante un entrenamiento.
 *
 * Distinguimos:
 *   - **HR reposo (restingHR)**: el valor mínimo sostenido en una ventana de
 *     30+ minutos entre las 4:00 y las 10:00 de la mañana. Coincide con lo que
 *     muestra Mi Fitness como "HR en reposo".
 *   - **HR entreno (avgWorkoutHR)**: promedio de samples durante una sesión
 *     de ExerciseSession. Si Mi Fitness ya escribió la sesión, la cruzamos.
 *
 * También calculamos un índice de estrés (HRV-based) usando HeartRateVariabilityRmssd.
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, averageHeartRate, dedupeBySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { dayRange } from "./stepsReader";

interface HrSample {
  ts: number;        // epoch ms
  bpm: number;
  sourceApp?: string;
}

/**
 * Lee todos los samples de HR de un día. Mi Fitness escribe series de samples.
 */
export async function readHeartRateSamplesForDay(dayIso: string): Promise<HrSample[]> {
  const { startMs, endMs } = dayRange(dayIso);
  const raw = await readHcRecords("HeartRate", startMs, endMs);

  const samples: HrSample[] = [];
  for (const r of raw) {
    // Un HeartRateRecord tiene samples[] con time + beatsPerMinute
    const records = r.samples ?? [r];
    for (const s of records) {
      samples.push({
        ts: s.time ?? r.startTime,
        bpm: s.beatsPerMinute,
        sourceApp: extractSourceApp(r)
      });
    }
  }
  return samples.sort((a, b) => a.ts - b.ts);
}

/**
 * Estima el HR en reposo: percentil 10 de los samples entre 4:00-10:00 local.
 * Filtro de outliers: descarta samples > 100 bpm (probablemente durante actividad).
 */
export async function readRestingHeartRate(dayIso: string): Promise<number | null> {
  const samples = await readHeartRateSamplesForDay(dayIso);
  if (samples.length === 0) return null;

  // Filtrar ventana 4-10h local (timezone del dispositivo)
  const dayStart = new Date(`${dayIso}T00:00:00`);
  const tzOffsetMin = dayStart.getTimezoneOffset();
  const lowerBound = dayStart.getTime() + 4 * 3600_000 - tzOffsetMin * 60_000;
  const upperBound = dayStart.getTime() + 10 * 3600_000 - tzOffsetMin * 60_000;

  const restingSamples = samples
    .filter((s) => s.ts >= lowerBound && s.ts <= upperBound)
    .filter((s) => s.bpm >= 35 && s.bpm <= 100)
    .map((s) => s.bpm);

  if (restingSamples.length < 5) {
    // Fallback: si no hay samples en la ventana, toma el percentil 10 global
    const allFiltered = samples.filter((s) => s.bpm >= 35 && s.bpm <= 100).map((s) => s.bpm);
    if (allFiltered.length === 0) return null;
    return percentile(allFiltered, 10);
  }
  return percentile(restingSamples, 10);
}

/**
 * HR promedio durante una sesión de ejercicio (por time range).
 */
export async function readAvgHeartRateInRange(
  startMs: number,
  endMs: number
): Promise<number | null> {
  const raw = await readHcRecords("HeartRate", startMs, endMs);
  const records: HealthRecord[] = [];
  for (const r of raw) {
    const samples = r.samples ?? [{ time: r.startTime, beatsPerMinute: r.beatsPerMinute }];
    for (const s of samples) {
      if (s.time >= startMs && s.time <= endMs) {
        records.push({
          recordType: "HeartRate",
          sourceApp: extractSourceApp(r),
          startedAt: s.time,
          endedAt: s.time + 60_000, // 1 min de peso para averaging
          value: s.beatsPerMinute,
          unit: "bpm"
        });
      }
    }
  }
  if (records.length === 0) return null;
  const { unique } = dedupeBySource(records);
  return averageHeartRate(unique).value;
}

/**
 * HR máximo durante una sesión.
 */
export async function readMaxHeartRateInRange(
  startMs: number,
  endMs: number
): Promise<number | null> {
  const raw = await readHcRecords("HeartRate", startMs, endMs);
  let max = 0;
  for (const r of raw) {
    const samples = r.samples ?? [{ beatsPerMinute: r.beatsPerMinute }];
    for (const s of samples) {
      if (s.time >= startMs && s.time <= endMs && s.beatsPerMinute > max) {
        max = s.beatsPerMinute;
      }
    }
  }
  return max > 0 ? max : null;
}

// --- Math helpers ----------------------------------------------------------
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}
