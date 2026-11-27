/**
 * bodyCompositionReader.ts
 * ----------------------------------------------------------------------------
 * Lee los records de composición corporal escritos por la Xiaomi S400 Scale
 * vía Mi Fitness (com.xiaomi.wearable).
 *
 * Health Connect expone:
 *   - WeightRecord        (peso en kg)
 *   - BodyFatRecord       (% grasa)
 *   - HeightRecord        (altura en m)
 *
 * NOTA: LeanBodyMass, BoneMass, BodyWaterMass NO son tipos estándar de HC en
 * todas las versiones. La Xiaomi S400 los calcula y los sincroniza con Mi
 * Fitness, pero HC los puede exponer como:
 *   a) Metadatos extra dentro del WeightRecord (en algunas builds de Mi Fitness)
 *   b) Tipos propios en HC 1.1.0-alpha+ (LeanBodyMassRecord, BoneMassRecord,
 *      BodyWaterMassRecord)
 *
 * Estrategia híbrida:
 *   1) Si los tipos propios existen (HC reciente), los leemos directamente.
 *   2) Si no, los derivamos:
 *      - LeanBodyMass = Weight * (1 - BodyFat/100)
 *      - BoneMass   ≈ Weight * 0.15 (constante biológica típica 12-15%)
 *      - BodyWaterMass = Weight * 0.60 (60% promedio, 50% mujeres)
 *
 *   El modo de cálculo se guarda en `sourceApp` (con sufijo '_derived').
 */
import { readHcRecords } from "../healthConnectClient";
import { extractSourceApp, dedupeBySource } from "../sourceFilter";
import type { HealthRecord } from "../types";
import { dayRange } from "./stepsReader";
import { toLocalISO } from "@/modules/intelligence/dateUtils";
import { massToKg, lengthToMeters, percentValue } from "../units";

export interface BodyComposition {
  measuredAt: number;
  weightKg?: number;
  bodyFatPct?: number;
  leanBodyMassKg?: number;
  boneMassKg?: number;
  bodyWaterMassKg?: number;
  muscleMassKg?: number;
  heightM?: number;
  sourceApp?: string;
  /** true si algunos valores son derivados (no escritos por la báscula). */
  derived: boolean;
}

/**
 * Lee la última composición corporal registrada en un día.
 */
export async function readBodyCompositionForDay(dayIso: string): Promise<BodyComposition | null> {
  const { startMs, endMs } = dayRange(dayIso);

  const [rawWeight, rawBodyFat, rawHeight] = await Promise.all([
    readHcRecords("Weight", startMs, endMs),
    readHcRecords("BodyFat", startMs, endMs),
    readHcRecords("Height", startMs, endMs)
  ]);

  if (rawWeight.length === 0 && rawBodyFat.length === 0) return null;

  // Dedup por source (Si Mi Fitness + Google Fit escribieron el mismo peso)
  const weightRecs: HealthRecord[] = rawWeight.map((r: any) => ({
    recordType: "Weight",
    sourceApp: extractSourceApp(r),
    startedAt: r.time,
    endedAt: r.time,
    value: massToKg(r.weight),
    unit: "kg",
    rawMeta: r.metadata
  }));
  const fatRecs: HealthRecord[] = rawBodyFat.map((r: any) => ({
    recordType: "BodyFat",
    sourceApp: extractSourceApp(r),
    startedAt: r.time,
    endedAt: r.time,
    value: percentValue(r.percentage),
    unit: "%",
    rawMeta: r.metadata
  }));
  const heightRecs: HealthRecord[] = rawHeight.map((r: any) => ({
    recordType: "Height",
    sourceApp: extractSourceApp(r),
    startedAt: r.time,
    endedAt: r.time,
    value: lengthToMeters(r.height),
    unit: "m",
    rawMeta: r.metadata
  }));

  const latestWeight = dedupeBySource(weightRecs.filter((r) => r.value > 0)).unique.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
  const latestFat = dedupeBySource(fatRecs.filter((r) => r.value > 0 && r.value < 80)).unique.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
  const latestHeight = dedupeBySource(heightRecs.filter((r) => r.value > 0)).unique.slice().sort((a, b) => b.startedAt - a.startedAt)[0];

  // Intentar leer tipos avanzados (HC 1.1+). Si la librería no los soporta,
  // las llamadas fallarán y caeremos al modo derivado.
  let leanMass: number | undefined;
  let boneMass: number | undefined;
  let waterMass: number | undefined;
  let derived = false;

  try {
    const rawLean = await readHcRecords("LeanBodyMass" as any, startMs, endMs);
    if (rawLean.length > 0) {
      leanMass = rawLean[0].mass?.value ?? rawLean[0].mass?.inKilograms ?? rawLean[0].leanBodyMass?.inKilograms;
    }
  } catch { /* tipo no soportado en esta versión de HC */ }

  try {
    const rawBone = await readHcRecords("BoneMass" as any, startMs, endMs);
    if (rawBone.length > 0) {
      boneMass = rawBone[0].mass?.value ?? rawBone[0].mass?.inKilograms;
    }
  } catch { /* tipo no soportado */ }

  try {
    const rawWater = await readHcRecords("BodyWaterMass" as any, startMs, endMs);
    if (rawWater.length > 0) {
      waterMass = rawWater[0].mass?.value ?? rawWater[0].mass?.inKilograms;
    }
  } catch { /* tipo no soportado */ }

  // Si no se pudieron leer directo, derivarlos
  if (latestWeight && latestFat && leanMass === undefined) {
    leanMass = latestWeight.value * (1 - latestFat.value / 100);
    derived = true;
  }
  if (latestWeight && boneMass === undefined) {
    boneMass = latestWeight.value * 0.045;   // 4-5% típicamente
    derived = true;
  }
  if (latestWeight && waterMass === undefined) {
    waterMass = latestWeight.value * 0.60;   // 60% promedio
    derived = true;
  }

  return {
    measuredAt: latestWeight?.startedAt ?? latestFat?.startedAt ?? Date.now(),
    weightKg: latestWeight?.value,
    bodyFatPct: latestFat?.value,
    leanBodyMassKg: leanMass,
    boneMassKg: boneMass,
    bodyWaterMassKg: waterMass,
    muscleMassKg: leanMass !== undefined && boneMass !== undefined ? leanMass - boneMass : undefined,
    heightM: latestHeight?.value,
    sourceApp: latestWeight?.sourceApp ?? latestFat?.sourceApp,
    derived
  };
}

/**
 * Lee los últimos N registros de peso (para la línea de tendencia semanal).
 */
export async function readWeightHistory(daysBack: number = 30): Promise<{ day: string; weightKg: number; measuredAt: number }[]> {
  const out: { day: string; weightKg: number; measuredAt: number }[] = [];
  const today = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = toLocalISO(d);
    const bc = await readBodyCompositionForDay(iso);
    if (bc?.weightKg) {
      out.push({ day: iso, weightKg: bc.weightKg, measuredAt: bc.measuredAt });
    }
  }
  return out.reverse();
}

/**
 * Última composición corporal registrada en los últimos `daysBack` días.
 *
 * BUG CORREGIDO (% grasa no aparecía): antes se buscaba el último PESO y luego
 * se leía el % de grasa SOLO de ese mismo día natural. Si la báscula (o Mi
 * Fitness) escribe la grasa en otro momento/día, o el campo venía como objeto
 * { value }, quedaba en "—". Ahora cada medida se busca por separado en toda la
 * ventana y se toma la más reciente de cada tipo.
 */
export async function readLatestBodyComposition(daysBack: number = 90): Promise<BodyComposition | null> {
  const endMs = Date.now();
  const startMs = endMs - daysBack * 86_400_000;

  const [rawWeight, rawFat, rawHeight] = await Promise.all([
    readHcRecords("Weight", startMs, endMs, { pageSize: 500 }),
    readHcRecords("BodyFat", startMs, endMs, { pageSize: 500 }),
    readHcRecords("Height", startMs, endMs, { pageSize: 100 })
  ]);

  const pickLatest = (raw: any[], conv: (r: any) => number, valid: (v: number) => boolean) =>
    raw
      .map((r) => ({ t: typeof r.time === "number" ? r.time : new Date(r.time).getTime(), v: conv(r), src: extractSourceApp(r) }))
      .filter((x) => !Number.isNaN(x.t) && valid(x.v))
      .sort((a, b) => b.t - a.t)[0];

  const w = pickLatest(rawWeight, (r) => massToKg(r.weight), (v) => v > 20 && v < 400);
  const f = pickLatest(rawFat, (r) => percentValue(r.percentage), (v) => v > 2 && v < 80);
  const h = pickLatest(rawHeight, (r) => lengthToMeters(r.height), (v) => v > 0.5 && v < 2.6);

  if (!w && !f) return null;

  const weightKg = w?.v;
  const bodyFatPct = f?.v;
  const lean = weightKg !== undefined && bodyFatPct !== undefined ? weightKg * (1 - bodyFatPct / 100) : undefined;
  const bone = weightKg !== undefined ? weightKg * 0.045 : undefined;
  const water = weightKg !== undefined ? weightKg * 0.6 : undefined;

  return {
    measuredAt: w?.t ?? f?.t ?? Date.now(),
    weightKg,
    bodyFatPct,
    leanBodyMassKg: lean,
    boneMassKg: bone,
    bodyWaterMassKg: water,
    muscleMassKg: lean !== undefined && bone !== undefined ? lean - bone : undefined,
    heightM: h?.v,
    sourceApp: w?.src ?? f?.src,
    // Masa ósea y agua son estimaciones (HC no las expone en esta versión).
    derived: true
  };
}
