/**
 * caloriesReader.ts
 * ----------------------------------------------------------------------------
 * Lee ActiveCaloriesBurnedRecord y BasalMetabolicRateRecord de HC.
 *
 * CORRECCIONES v0.3.7:
 *   - Activas: antes salía 1.188.000 kcal porque se leía `inCalories` (calorías
 *     pequeñas) en vez de `inKilocalories`. Ahora se convierte con energyToKcal().
 *   - Pasos/kcal: ya no se descartan records legítimos del mismo minuto
 *     (dedupeExact en vez de dedupeBySource).
 *   - Basal: Mi Fitness normalmente NO escribe BasalMetabolicRate en Health
 *     Connect (en los logs salía "0 registros" → 0 kcal). Si no hay record se
 *     calcula con Mifflin-St Jeor usando el perfil y se prorratea por la hora
 *     del día (si es hoy).
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, sumAccumulables, dedupeExact, keepPrimarySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { energyToKcal, powerToKcalPerDay } from "../units";
import { todayISO } from "@/modules/intelligence/dateUtils";
import { useSettingsStore } from "@/store/settingsStore";
import { dayRange } from "./stepsReader";

const toMs = (v: any): number => (typeof v === "number" ? v : new Date(v).getTime());

/** Techo razonable de kcal activas en un día (protege contra errores de unidad). */
const MAX_PLAUSIBLE_ACTIVE_KCAL = 15000;

export interface DailyCalories {
  day: string;
  activeKcal: number;
  basalKcal: number;
  /** BMR en kcal/día completo (no prorrateado). */
  bmrPerDay: number;
  basalSource: "health_connect" | "profile" | "none";
  totalKcal: number;
  sourceApp?: string;
}

/** Mifflin-St Jeor con los datos del perfil (null si faltan). */
export function profileBmrPerDay(): number | null {
  const { weightKg, heightCm, ageYears, gender } = useSettingsStore.getState();
  if (!weightKg || !heightCm || !ageYears || !gender) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(gender === "male" ? base + 5 : base - 161);
}

function sumActive(raw: any[], dayIso?: string): { kcal: number; sourceApp?: string } {
  const recs: HealthRecord[] = raw.map((r: any) => ({
    recordType: "ActiveCaloriesBurned",
    sourceApp: extractSourceApp(r),
    day: dayIso,
    startedAt: toMs(r.startTime),
    endedAt: toMs(r.endTime),
    value: energyToKcal(r.energy),
    unit: "kcal",
    rawMeta: r.metadata
  }));
  const unique = dedupeExact(keepPrimarySource(recs));
  if (unique.length === 0) return { kcal: 0 };
  let kcal = sumAccumulables(unique).value;
  // Red de seguridad: si aún así sale un valor imposible, casi seguro es una
  // unidad equivocada (calorías pequeñas). Se corrige y se deja rastro en el log.
  if (kcal > MAX_PLAUSIBLE_ACTIVE_KCAL && kcal / 1000 <= MAX_PLAUSIBLE_ACTIVE_KCAL) {
    console.warn(`[calories] valor implausible ${Math.round(kcal)} kcal → se divide entre 1000`);
    kcal = kcal / 1000;
  }
  return { kcal, sourceApp: unique[0]?.sourceApp };
}

/**
 * Lee el gasto calórico total de un día (activa + basal).
 */
export async function readCaloriesForDay(dayIso: string): Promise<DailyCalories | null> {
  const { startMs, endMs } = dayRange(dayIso);

  // 1) Calorías activas
  const rawActive = await readHcRecords("ActiveCaloriesBurned", startMs, endMs, { pageSize: 5000 });
  const active = sumActive(rawActive, dayIso);

  // 2) Metabolismo basal: record de HC (si existe) o fórmula con el perfil.
  let bmrPerDay = 0;
  let basalSource: DailyCalories["basalSource"] = "none";

  const rawBasal = await readHcRecords("BasalMetabolicRate", startMs, endMs);
  if (rawBasal.length > 0) {
    const latest = rawBasal
      .map((r: any) => ({ t: toMs(r.time ?? r.startTime), v: powerToKcalPerDay(r.basalMetabolicRate) }))
      .filter((x) => x.v > 500 && x.v < 5000)
      .sort((a, b) => b.t - a.t)[0];
    if (latest) { bmrPerDay = latest.v; basalSource = "health_connect"; }
  }
  if (basalSource === "none") {
    const est = profileBmrPerDay();
    if (est) { bmrPerDay = est; basalSource = "profile"; }
  }

  // El BMR es por DÍA COMPLETO: si es hoy solo se ha gastado la fracción transcurrida.
  const now = new Date();
  const fraction = dayIso === todayISO() ? (now.getHours() * 60 + now.getMinutes()) / 1440 : 1;
  const basalKcal = bmrPerDay * fraction;

  if (active.kcal === 0 && basalKcal === 0) return null;

  return {
    day: dayIso,
    activeKcal: active.kcal,
    basalKcal,
    bmrPerDay,
    basalSource,
    totalKcal: active.kcal + basalKcal,
    sourceApp: active.sourceApp
  };
}

/**
 * Lee calorías activas entre dos timestamps (para una sesión de entreno).
 */
export async function readActiveCaloriesInRange(startMs: number, endMs: number): Promise<number> {
  const raw = await readHcRecords("ActiveCaloriesBurned", startMs, endMs, { pageSize: 5000 });
  return sumActive(raw).kcal;
}
