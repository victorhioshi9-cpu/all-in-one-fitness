/**
 * stressReader.ts
 * ----------------------------------------------------------------------------
 * Health Connect NO expone un tipo "Stress" estándar. Mi Fitness calcula el
 * estrés a partir de:
 *   - Variabilidad de la frecuencia cardíaca (HRV-RMSSD)
 *   - HR en reposo vs baseline personal
 *   - Carga de actividad del día
 *
 * Estrategia:
 *   1) Si HC tiene HeartRateVariabilityRmssdRecord, lo leemos y usamos la
 *      fórmula de Baevsky: SI = RMSSD inverso -> índice 0..100.
 *   2) Si no hay HRV, estimamos el estrés con:
 *        stressIndex = clamp( (restingHR - 50) / (100 - 50) * 100 )
 *      Un HR en reposo alto relativo al baseline indica estrés / fatiga.
 *
 * El resultado es un índice 0..100 donde 0=relajado y 100=estrés alto.
 */
import { readHcRecords } from "../healthConnectClient";
import { dayRange } from "./stepsReader";
import { readRestingHeartRate } from "./heartRateReader";

export interface StressSummary {
  day: string;
  stressIndex: number;            // 0..100
  hrvRmssdMs?: number;
  restingHr?: number;
  method: "hrv" | "hr_estimate";
  sourceApp?: string;
}

/**
 * Calcula el índice de estrés del día.
 */
export async function readStressForDay(dayIso: string): Promise<StressSummary | null> {
  const { startMs, endMs } = dayRange(dayIso);

  // 1) Intentar HRV-RMSSD
  try {
    const raw = await readHcRecords("HeartRateVariabilityRmssd", startMs, endMs);
    if (raw.length > 0) {
      // Tomar el promedio del día (Mi Fitness suele escribir uno por la mañana)
      const values = raw.map((r: any) => r.heartRateVariabilityRmssd?.inMilliseconds ?? 0);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      // Mapeo empírico: RMSSD 60ms -> 10 (relajado), 20ms -> 80 (estrés alto)
      // Fórmula: stressIndex = clamp(100 - (avg - 20) / (60 - 20) * 90)
      const idx = Math.max(0, Math.min(100, 100 - ((avg - 20) / 40) * 90));
      return {
        day: dayIso,
        stressIndex: Math.round(idx),
        hrvRmssdMs: avg,
        method: "hrv",
        sourceApp: raw[0]?.metadata?.dataOrigin
      };
    }
  } catch { /* tipo HRV no disponible */ }

  // 2) Fallback: HR en reposo
  const resting = await readRestingHeartRate(dayIso);
  if (resting === null) return null;

  // Mapeo: HR 50 -> 0, HR 80 -> 100 (más o menos)
  const idx = Math.max(0, Math.min(100, ((resting - 50) / 30) * 100));
  return {
    day: dayIso,
    stressIndex: Math.round(idx),
    restingHr: resting,
    method: "hr_estimate"
  };
}
