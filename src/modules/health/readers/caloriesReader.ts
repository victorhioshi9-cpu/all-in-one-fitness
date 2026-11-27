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
import { extractSourceApp, sumAccumulables, dedupeBySource, keepPrimarySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { todayISO } from "@/modules/intelligence/dateUtils";

// BUG CORREGIDO: antes se importaba `toMs` desde dateUtils, pero esa función NO existe
// allí (es privada de healthConnectClient). Al ser undefined, readCaloriesForDay lanzaba
// TypeError y la pantalla mostraba "—" en kcal. normalizeRecord ya entrega ms, así que
// basta este helper tolerante.
const toMs = (v: any): number => (typeof v === "number" ? v : new Date(v).getTime());

/** Convierte un objeto Energy de HC v3.2 a kcal. */
function energyToKcal(e: any): number {
  if (!e) return 0;
  const val = typeof e.value === "number" ? e.value : 0;
  const unit = e.unit ?? "";
  if (unit === "calories") return val / 1000;
  if (unit === "joules") return val / 4184;
  if (unit === "kilojoules") return val / 4.184;
  return val; // kilocalories o desconocido
}
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
  const rawActive = await readHcRecords("ActiveCaloriesBurned", startMs, endMs, { pageSize: 5000 });
  const activeRecs: HealthRecord[] = rawActive.map((r: any) => ({
    recordType: "ActiveCaloriesBurned",
    sourceApp: extractSourceApp(r),
    day: dayIso,
    startedAt: toMs(r.startTime),
    endedAt: toMs(r.endTime),
    value: energyToKcal(r.energy),
    unit: "kcal",
    rawMeta: r.metadata
  }));
  const { unique: uniqueActive } = dedupeBySource(keepPrimarySource(activeRecs));
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
    // El BMR es kcal por DÍA COMPLETO. Si es hoy, solo se ha "gastado" la fracción
    // transcurrida (si no, a las 10 am ya sumabas toda la basal del día).
    const now = new Date();
    const fraction = dayIso === todayISO()
      ? (now.getHours() * 60 + now.getMinutes()) / 1440
      : 1;
    basalKcal = bmrPerDay * fraction;
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
  const raw = await readHcRecords("ActiveCaloriesBurned", startMs, endMs, { pageSize: 5000 });
  const recs: HealthRecord[] = raw.map((r: any) => ({
    recordType: "ActiveCaloriesBurned",
    sourceApp: extractSourceApp(r),
    startedAt: toMs(r.startTime),
    endedAt: toMs(r.endTime),
    value: energyToKcal(r.energy),
    unit: "kcal"
  }));
  if (recs.length === 0) return 0;
  const { unique } = dedupeBySource(keepPrimarySource(recs));
  return sumAccumulables(unique).value;
}
