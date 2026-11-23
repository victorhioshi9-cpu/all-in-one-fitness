/**
 * readiness.ts
 * ----------------------------------------------------------------------------
 * Readiness Score (0..100) cruzando:
 *   - Sleep score (duración + eficiencia + deep/rem) → 40% peso
 *   - Resting HR delta vs baseline personal (7 días) → 35% peso
 *   - Muscle fatigue (volumen昨天 vs media 7 días) → 25% peso
 *
 * Interpretación:
 *   85-100: óptimo, listo para entrenar intenso.
 *   70-84:  bueno, entreno normal.
 *   50-69:  moderado, considera deload o cardio.
 *   <50:    bajo, descanso activo o día libre.
 */
import { readSleepForDay } from "@/modules/health/readers/sleepReader";
import { readRestingHeartRate } from "@/modules/health/readers/heartRateReader";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { yesterdayISO, todayISO } from "./dateUtils";

export interface ReadinessFactor {
  key: "sleep" | "restingHr" | "muscleFatigue";
  label: string;
  score: number;          // 0..100
  value: string;          // descripción legible: "7h 12m · deep 1h20"
  detail?: string;
}

export interface ReadinessResult {
  day: string;
  totalScore: number;     // 0..100
  level: "optimal" | "good" | "moderate" | "low";
  factors: ReadinessFactor[];
  recommendation: string;
}

/**
 * Calcula el readiness de HOY basándose en el sueño de anoche + HR reposo
 * de hoy + volumen de entreno de ayer.
 */
export async function computeReadiness(): Promise<ReadinessResult> {
  const today = todayISO();
  const yesterday = yesterdayISO();

  // 1) Sleep score
  const sleep = await readSleepForDay(today);
  let sleepScore = 50;
  let sleepValue = "Sin datos de sueño";
  if (sleep) {
    const asleepH = sleep.asleepMs / 3600_000;
    const effPct = sleep.efficiency * 100;
    const deepH = sleep.deepMs / 3600_000;
    // Score: 7.5h+ efficiency 0.9+ -> 100; menos de 5h o eff <0.7 -> 0
    const durScore = clamp((asleepH - 4.5) / (8 - 4.5) * 100, 0, 100);
    const effScore = clamp((effPct - 70) / (95 - 70) * 100, 0, 100);
    const deepScore = clamp((deepH - 0.5) / (1.5 - 0.5) * 100, 0, 100);
    sleepScore = durScore * 0.5 + effScore * 0.3 + deepScore * 0.2;
    sleepValue = `${formatHours(asleepH)} · eff ${effPct.toFixed(0)}% · deep ${formatHours(deepH)}`;
  }

  // 2) Resting HR delta vs baseline
  const todayRhr = await readRestingHeartRate(today);
  const baselineRhr = await computeBaselineRestingHr(7);
  let hrScore = 50;
  let hrValue = "Sin datos de HR";
  if (todayRhr !== null) {
    hrValue = `${todayRhr} bpm`;
    if (baselineRhr) {
      const delta = todayRhr - baselineRhr;
      // delta 0 -> 100; +10 bpm -> 0; -5 bpm -> 100
      hrScore = clamp(100 - delta * 8, 0, 100);
      if (delta > 0) hrValue += ` (+${delta} vs baseline)`;
      else if (delta < 0) hrValue += ` (${delta} vs baseline)`;
    }
  }

  // 3) Muscle fatigue: volumen de ayer vs media 7 días
  const fatigueScore = await computeMuscleFatigueScore(yesterday);
  const fatigueValue = await describeYesterdayVolume(yesterday);

  // Total weighted
  const total = Math.round(
    sleepScore * 0.4 + hrScore * 0.35 + fatigueScore * 0.25
  );

  const level: ReadinessResult["level"] =
    total >= 85 ? "optimal" :
    total >= 70 ? "good" :
    total >= 50 ? "moderate" : "low";

  const recommendation = levelToRecommendation(level, fatigueScore);

  return {
    day: today,
    totalScore: total,
    level,
    factors: [
      { key: "sleep", label: "Sueño", score: Math.round(sleepScore), value: sleepValue },
      { key: "restingHr", label: "FC Reposo", score: Math.round(hrScore), value: hrValue },
      { key: "muscleFatigue", label: "Fatiga Muscular", score: Math.round(fatigueScore), value: fatigueValue }
    ],
    recommendation
  };
}

// --- Helpers ---------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return `${hrs}h ${min}m`;
}

function levelToRecommendation(level: ReadinessResult["level"], fatigueScore: number): string {
  switch (level) {
    case "optimal": return "Listo para entrenamiento intenso. Ve a por un PR.";
    case "good": return "Entreno normal. Mantén tu planificación.";
    case "moderate": return fatigueScore < 50
      ? "Fatiga muscular moderada. Considera tren superior hoy."
      : "Recuperación incompleta. Cardo o movilidad recomendado.";
    case "low": return "Día de descanso activo o libre. Duerme más y hidrátate.";
  }
}

async function computeBaselineRestingHr(daysBack: number): Promise<number | null> {
  // Promedio de los últimos `daysBack` resting HR
  const samples: number[] = [];
  const today = new Date();
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const r = await readRestingHeartRate(iso);
    if (r !== null) samples.push(r);
  }
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
}

async function computeMuscleFatigueScore(yesterdayIso: string): Promise<number> {
  const db = await openDatabase();
  // Volumen de ayer
  const yesterdayRow = await queryAsync<{ vol: number | null }>(
    db,
    `SELECT COALESCE(SUM(volume_kg), 0) as vol FROM sets
     WHERE date(created_at/1000, 'unixepoch') = ?`,
    [yesterdayIso]
  );
  const yesterdayVol = yesterdayRow[0]?.vol ?? 0;

  // Media de volumen de los últimos 7 días
  const sevenRow = await queryAsync<{ avg: number | null }>(
    db,
    `SELECT AVG(daily_vol) as avg FROM (
       SELECT date(created_at/1000, 'unixepoch') as d, SUM(volume_kg) as daily_vol
       FROM sets
       WHERE created_at >= ?
       GROUP BY d
     )`,
    [Date.now() - 7 * 24 * 3600_000]
  );
  const avgVol = sevenRow[0]?.avg ?? 0;

  if (avgVol === 0) {
    return 100; // sin datos de fatiga -> sin fatiga
  }
  // Fatiga alta si yesterdayVol >> avgVol (entrenaste mucho más que la media).
  // Score = 100 - clamp((yesterday - avg) / avg * 100, 0, 100)
  const ratio = yesterdayVol / avgVol;
  if (ratio <= 1) return 100;
  return clamp(100 - (ratio - 1) * 100, 0, 100);
}

async function describeYesterdayVolume(yesterdayIso: string): Promise<string> {
  const db = await openDatabase();
  const r = await queryAsync<{ vol: number | null; sets: number }>(
    db,
    `SELECT COALESCE(SUM(volume_kg), 0) as vol, COUNT(*) as sets FROM sets
     WHERE date(created_at/1000, 'unixepoch') = ?`,
    [yesterdayIso]
  );
  const vol = r[0]?.vol ?? 0;
  const sets = r[0]?.sets ?? 0;
  if (vol === 0) return "Sin entreno ayer";
  return `${Math.round(vol)}kg · ${sets} series`;
}
