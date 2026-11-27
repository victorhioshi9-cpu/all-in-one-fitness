/**
 * caloriesReader.ts
 * ----------------------------------------------------------------------------
 * Lee ActiveCaloriesBurnedRecord y BasalMetabolicRateRecord de HC.
 *
 * Mi Fitness calcula el gasto activo a partir del sensor de movimiento y la
 * frecuencia cardíaca del reloj. La basal la estima con la fórmula Mifflin-St Jeor
 * a partir de peso/altura/edad configurados en Mi Fitness.
 *
 * Exponemos ambas para el cálculo de Energy Balance (Fase 2: Inteligencia Cruzada).
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, sumAccumulables, dedupeBySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { toMs } from "@/modules/intelligence/dateUtils";
import { dayRange } from "./stepsReader";

export interface DailyCalories {
  day: string;
  activeKcal: number;
  basalKcal: number;
  totalKcal: number;
  sourceApp?: string;
}

/**
 * Lee el gasto calórico total de un día (activa + basal).
 */
export async function readCaloriesForDay(dayIso: string): Promise<DailyCalories | null> {
  const { startMs, endMs } = dayRange(dayIso);

  // 1) Active Calories
  const rawActive = await readHcRecords("ActiveCaloriesBurned", startMs, endMs);
  const activeRecs: HealthRecord[] = rawActive.map((r: any) => ({
    recordType: "ActiveCaloriesBurned",
    sourceApp: extractSourceApp(r),
    day: dayIso,
    startedAt: toMs(r.startTime),
    endedAt: toMs(r.endTime),
    value: r.energy?.value ?? r.energy?.inCalories ?? r.energy?.inKilocalories ?? 0,
    unit: "kcal",
    rawMeta: r.metadata
  }));
  const { unique: uniqueActive } = dedupeBySource(activeRecs);
  const activeKcal = uniqueActive.length > 0 ? sumAccumulables(uniqueActive).value : 0;

  // 2) Basal Metabolic Rate
  // BMR en HC se escribe como instante (no como rango). Leemos el último del día.
  const rawBasal = await readHcRecords("BasalMetabolicRate", startMs, endMs);
  const basalRecs: HealthRecord[] = rawBasal.map((r: any) => ({
    recordType: "BasalMetabolicRate",
    sourceApp: extractSourceApp(r),
    day: dayIso,
    startedAt: toMs(r.time),
    value: r.basalMetabolicRate?.value ?? r.basalMetabolicRate?.inCalories ?? r.basalMetabolicRate?.inKilocalories ?? 0,
    unit: "kcal/day",
    rawMeta: r.metadata
  }));

  // BMR en kcal/día -> multiplicar por fracción del día cubierto.
  // Mi Fitness suele escribir un único BMR diario; tomamos el último.
  let basalKcal = 0;
  if (basalRecs.length > 0) {
    const sorted = basalRecs.slice().sort((a, b) => b.startedAt - a.startedAt);
    const bmrPerDay = sorted[0].value;
    // Convertir kcal/día -> kcal del día (asumimos BMR válido para todo el día)
    basalKcal = bmrPerDay;
  }

  if (activeKcal === 0 && basalKcal === 0) return null;

  return {
    day: dayIso,
    activeKcal,
    basalKcal,
    totalKcal: activeKcal + basalKcal,
    sourceApp: uniqueActive[0]?.sourceApp ?? basalRecs[0]?.sourceApp
  };
}

/**
 * Lee calorías activas entre dos timestamps (para una sesión de entreno).
 */
export async function readActiveCaloriesInRange(
  startMs: number,
  endMs: number
): Promise<number> {
  const raw = await readHcRecords("ActiveCaloriesBurned", startMs, endMs);
  const recs: HealthRecord[] = raw.map((r: any) => ({
    recordType: "ActiveCaloriesBurned",
    sourceApp: extractSourceApp(r),
    startedAt: toMs(r.startTime),
    endedAt: toMs(r.endTime),
    value: r.energy?.value ?? r.energy?.inCalories ?? r.energy?.inKilocalories ?? 0,
    unit: "kcal"
  }));
  if (recs.length === 0) return 0;
  const { unique } = dedupeBySource(recs);
  return sumAccumulables(unique).value;
}
