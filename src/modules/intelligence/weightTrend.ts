/**
 * weightTrend.ts
 * ----------------------------------------------------------------------------
 * Línea de tendencia semanal de peso, FILTRANDO retención de líquidos.
 *
 * Problema: el peso fluctúa 0.5-2kg diarios por hidratación, ciclo menstrual,
 * carga glucógeno, horas de sueño. Una sola medición no significa nada.
 *
 * Solución:
 *   1) Suavizado por rolling 7-day median (no mean: la mediana es robusta a
 *      outliers tipo "pesé después de una comida copiosa").
 *   2) Detección de outliers: si una medición está a >2 desviaciones estándar
 *      de la tendencia, la marcamos como "retención de líquidos" y no la
 *      usamos para calcular el delta real.
 *   3) Pendiente semanal (kg/semana) ajustada por regresión lineal sobre los
 *      puntos limpios.
 */
import { readWeightHistory } from "@/modules/health/readers/bodyCompositionReader";

export interface WeightPoint {
  day: string;
  weightKg: number;
  measuredAt: number;
  /** true si el valor fue marcado como outlier (retención de líquidos). */
  isOutlier: boolean;
}

export interface WeightTrend {
  points: WeightPoint[];
  /** Peso suavizado de hoy (rolling 7-day median). */
  smoothedTodayKg: number;
  /** Delta real vs ayer (en kg, sin ruido). */
  deltaKg: number;
  /** Tendencia semanal: kg por semana (regresión lineal). */
  weeklyTrendKg: number;
  /** Predicción del peso en 4 semanas si se mantiene la tendencia actual. */
  projection4wKg: number;
  /** true si el peso lleva 3+ días estable ( plan de corte/volumen OK. */
  isStable: boolean;
}

export async function computeWeightTrend(): Promise<WeightTrend> {
  const history = await readWeightHistory(30);
  if (history.length === 0) {
    return {
      points: [],
      smoothedTodayKg: 0,
      deltaKg: 0,
      weeklyTrendKg: 0,
      projection4wKg: 0,
      isStable: false
    };
  }

  // Detectar outliers con MAD (Median Absolute Deviation - robusto)
  const weights = history.map((h) => h.weightKg);
  const median = computeMedian(weights);
  const deviations = weights.map((w) => Math.abs(w - median));
  const mad = computeMedian(deviations);
  // Outlier si |w - median| > 2 * 1.4826 * mad (regla clásica)
  const threshold = 2 * 1.4826 * (mad || 0.5);

  const points: WeightPoint[] = history.map((h) => ({
    day: h.day,
    weightKg: h.weightKg,
    measuredAt: h.measuredAt,
    isOutlier: threshold > 0 && Math.abs(h.weightKg - median) > threshold
  }));

  // Filtrar outliers para el cálculo de tendencia
  const cleanPoints = points.filter((p) => !p.isOutlier);
  const cleanWeights = cleanPoints.map((p) => p.weightKg);

  // Rolling 7-day median sobre puntos limpios
  const last7 = cleanWeights.slice(-7);
  const smoothedToday = last7.length > 0 ? computeMedian(last7) : cleanWeights[cleanWeights.length - 1];

  // Delta real: smoothedToday vs ayer (también suavizado)
  const last7Prev = cleanWeights.slice(-8, -1);
  const smoothedYesterday = last7Prev.length > 0 ? computeMedian(last7Prev) : smoothedToday;
  const delta = smoothedToday - smoothedYesterday;

  // Regresión lineal sobre cleanPoints (x = day index, y = weight)
  const n = cleanPoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  cleanPoints.forEach((p, i) => {
    sumX += i;
    sumY += p.weightKg;
    sumXY += i * p.weightKg;
    sumX2 += i * i;
  });
  const slopePerDay = n > 1 && (n * sumX2 - sumX * sumX) !== 0
    ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    : 0;
  const weeklyTrend = slopePerDay * 7;

  // Proyección 4 semanas
  const projection4w = smoothedToday + weeklyTrend * 4;

  // Estabilidad: desviación típica de los últimos 7 días < 0.4kg
  const last7Std = computeStdDev(last7);
  const isStable = last7Std < 0.4;

  return {
    points,
    smoothedTodayKg: smoothedToday,
    deltaKg: delta,
    weeklyTrendKg: weeklyTrend,
    projection4wKg: projection4w,
    isStable
  };
}

// --- Math helpers ----------------------------------------------------------
function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeStdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
