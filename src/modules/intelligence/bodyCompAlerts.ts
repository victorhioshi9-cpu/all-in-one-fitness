/**
 * bodyCompAlerts.ts
 * ----------------------------------------------------------------------------
 * Alertas ante cambios bruscos de composición corporal.
 *
 * Reglas:
 *   1) Caída de peso > 1.2 kg en 24h sin cambio en ingesta calórica
 *      → sospecha de deshidratación o enfermedad.
 *   2) Subida de peso > 1.5 kg en 24h
 *      → retención de líquidos o ingesta excesiva.
 *   3) Aumento de BodyFat % > 1.0 en una semana
 *      → aunque el peso baje, estás perdiendo músculo (mala señal en déficit).
 *   4) Caída de BodyFat % > 1.5 en una semana con peso estable
 *      → posible pérdida de grasa genuina (felicitaciones).
 *   5) LeanBodyMass bajando > 0.5 kg en 2 semanas
 *      → pérdida de músculo, ajustar proteína / entreno.
 */
import { readWeightHistory, readBodyCompositionForDay } from "@/modules/health/readers/bodyCompositionReader";
import { daysAgoISO, todayISO } from "./dateUtils";
import { computeWeightTrend } from "./weightTrend";

export type AlertSeverity = "info" | "warning" | "critical";

export interface BodyCompAlert {
  code: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Valor numérico que disparó la alerta (si aplica). */
  value?: number;
}

export async function detectBodyCompAlerts(): Promise<BodyCompAlert[]> {
  const alerts: BodyCompAlert[] = [];
  const today = todayISO();
  const yesterday = daysAgoISO(1);

  const [todayBC, yesterdayBC, weekAgoBC, twoWeeksAgoBC] = await Promise.all([
    readBodyCompositionForDay(today),
    readBodyCompositionForDay(yesterday),
    readBodyCompositionForDay(daysAgoISO(7)),
    readBodyCompositionForDay(daysAgoISO(14))
  ]);

  // Trend suavizado
  const trend = await computeWeightTrend();

  // 1) Caída brusca peso (24h)
  if (todayBC?.weightKg && yesterdayBC?.weightKg) {
    const delta = todayBC.weightKg - yesterdayBC.weightKg;
    if (delta < -1.2) {
      alerts.push({
        code: "WEIGHT_FAST_DROP",
        severity: "warning",
        title: "Caída de peso brusca",
        message: `Perdiste ${Math.abs(delta).toFixed(2)} kg en 24h. Posible deshidratación o glucógeno bajo. Hidrátate y revisa electrolitos.`,
        value: delta
      });
    }
    if (delta > 1.5) {
      alerts.push({
        code: "WEIGHT_FAST_GAIN",
        severity: "warning",
        title: "Subida de peso brusca",
        message: `Ganaste ${delta.toFixed(2)} kg en 24h. Probable retención de líquidos o cena copiosa. No modifiques tu plan por esto.`,
        value: delta
      });
    }
  }

  // 2) Tendencia semanal
  if (trend.points.length > 0) {
    if (trend.weeklyTrendKg < -0.8) {
      alerts.push({
        code: "WEEKLY_FAST_LOSS",
        severity: "info",
        title: "Pérdida rápida de peso",
        message: `Estás bajando ${Math.abs(trend.weeklyTrendKg).toFixed(2)} kg/semana. Si tu objetivo es déficit, perfecto; vigila no pasar de -0.7kg/semana para preservar músculo.`,
        value: trend.weeklyTrendKg
      });
    }
    if (trend.weeklyTrendKg > 0.5) {
      alerts.push({
        code: "WEEKLY_FAST_GAIN",
        severity: "info",
        title: "Ganancia de peso rápida",
        message: `Estás subiendo ${trend.weeklyTrendKg.toFixed(2)} kg/semana. Si estás en volumen, controla que no sea solo grasa.`,
        value: trend.weeklyTrendKg
      });
    }
  }

  // 3) BodyFat delta semanal
  if (todayBC?.bodyFatPct && weekAgoBC?.bodyFatPct) {
    const delta = todayBC.bodyFatPct - weekAgoBC.bodyFatPct;
    if (delta > 1.0) {
      alerts.push({
        code: "BODYFAT_WEEKLY_INCREASE",
        severity: "warning",
        title: "Aumento de % grasa",
        message: `Tu % grasa subió ${delta.toFixed(1)} pts en una semana. Revisa déficit calórico y actividad.`,
        value: delta
      });
    }
    if (delta < -1.5) {
      alerts.push({
        code: "BODYFAT_WEEKLY_DECREASE",
        severity: "info",
        title: "Reducción de % grasa",
        message: `Tu % grasa bajó ${Math.abs(delta).toFixed(1)} pts en una semana. ¡Buen trabajo! Mantén proteína y entreno.`,
        value: delta
      });
    }
  }

  // 4) LeanBodyMass delta en 2 semanas
  if (todayBC?.leanBodyMassKg && twoWeeksAgoBC?.leanBodyMassKg) {
    const delta = todayBC.leanBodyMassKg - twoWeeksAgoBC.leanBodyMassKg;
    if (delta < -0.5) {
      alerts.push({
        code: "LEAN_MASS_DROP",
        severity: "critical",
        title: "Pérdida de masa magra",
        message: `Perdiste ${Math.abs(delta).toFixed(2)} kg de masa magra en 2 semanas. Sube proteína a 2.0g/kg y revisa volumen de entreno.`,
        value: delta
      });
    }
    if (delta > 0.5) {
      alerts.push({
        code: "LEAN_MASS_GAIN",
        severity: "info",
        title: "Ganancia de masa magra",
        message: `Ganaste ${delta.toFixed(2)} kg de masa magra en 2 semanas. ¡Sigue así!`,
        value: delta
      });
    }
  }

  return alerts;
}
