/**
 * doubleProgression.ts
 * ----------------------------------------------------------------------------
 * Doble progresión automática de cargas.
 *
 * Modelo clásico:
 *   - El usuario mantiene un peso fijo y progresa en reps dentro de un rango
 *     (por ejemplo 6-8 reps).
 *   - Cuando alcanza el máximo de reps en TODAS las series planificadas,
 *     sube el peso un delta fijo (típicamente +2.5 kg upper, +5 kg lower).
 *   - Si no llega al mínimo de reps en todas las series: mantiene peso y
 *     baja reps si hace falta.
 *
 * Esta función analiza el histórico de sets del ejercicio y propone la carga
 * óptima para la próxima sesión.
 */
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { estimate1RM } from "@/modules/persistence/repositories/setRepo";

export interface DoubleProgressionConfig {
  exerciseId: string;
  minReps: number;        // ej. 6
  maxReps: number;        // ej. 8
  targetSets: number;     // ej. 4
  weightIncrementKg: number;  // ej. 2.5 upper body, 5 lower body
}

export interface DoubleProgressionSuggestion {
  exerciseId: string;
  lastWeight: number;
  lastReps: number[];
  nextWeight: number;
  nextTargetReps: number;
  recommendation: "increase_weight" | "increase_reps" | "maintain" | "deload";
  reason: string;
  est1rm: number;
}

export async function computeDoubleProgression(
  cfg: DoubleProgressionConfig
): Promise<DoubleProgressionSuggestion | null> {
  const db = await openDatabase();
  // Última sesión de este ejercicio con sus series
  const lastSets = await queryAsync<{ weight_kg: number; reps: number; created_at: number }>(
    db,
    `SELECT weight_kg, reps, created_at FROM sets
     WHERE exercise_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [cfg.exerciseId, cfg.targetSets]
  );
  if (lastSets.length === 0) return null;

  const lastWeight = lastSets[0].weight_kg;
  const lastReps = lastSets.map(s => s.reps);
  const allSetsReachedMax = lastReps.every(r => r >= cfg.maxReps);
  const anySetBelowMin = lastReps.some(r => r < cfg.minReps);
  const est1rm = Math.max(...lastSets.map(s => estimate1RM(s.weight_kg, s.reps)));

  if (allSetsReachedMax && lastSets.length >= cfg.targetSets) {
    // Subir peso
    const nextWeight = lastWeight + cfg.weightIncrementKg;
    return {
      exerciseId: cfg.exerciseId,
      lastWeight,
      lastReps,
      nextWeight,
      nextTargetReps: cfg.minReps,
      recommendation: "increase_weight",
      reason: `Alcanzaste ${cfg.maxReps} reps en todas las series. Subimos ${cfg.weightIncrementKg} kg y volvemos a ${cfg.minReps} reps.`,
      est1rm
    };
  }

  if (anySetBelowMin) {
    // Mantener peso pero bajar objetivo de reps
    const avgReps = Math.round(lastReps.reduce((s, r) => s + r, 0) / lastReps.length);
    return {
      exerciseId: cfg.exerciseId,
      lastWeight,
      lastReps,
      nextWeight: lastWeight,
      nextTargetReps: Math.max(cfg.minReps - 1, avgReps),
      recommendation: "maintain",
      reason: `No alcanzaste ${cfg.minReps} reps en todas las series. Mantén ${lastWeight} kg y apunta a ${avgReps} reps.`,
      est1rm
    };
  }

  // Estás en el rango: intentar una rep más
  const nextTargetReps = Math.min(cfg.maxReps, Math.max(...lastReps) + 1);
  return {
    exerciseId: cfg.exerciseId,
    lastWeight,
    lastReps,
    nextWeight: lastWeight,
    nextTargetReps,
    recommendation: "increase_reps",
    reason: `Vas bien. Mantén ${lastWeight} kg e intenta ${nextTargetReps} reps.`,
    est1rm
  };
}

/**
 * Sugerencia de Deload:
 *   - Si en las últimas 2 sesiones el est1rm bajó > 5% → deload (-10% peso).
 *   - Si carryover muy alto sin mejorar → deload.
 */
export async function suggestDeload(exerciseId: string): Promise<{ needed: boolean; reason?: string; deloadWeight?: number }> {
  const db = await openDatabase();
  const recent = await queryAsync<{ weight_kg: number; reps: number; created_at: number }>(
    db,
    `SELECT weight_kg, reps, created_at FROM sets
     WHERE exercise_id = ?
     ORDER BY created_at DESC LIMIT 8`,
    [exerciseId]
  );
  if (recent.length < 4) return { needed: false };

  // Tomar el est1rm de las últimas 2 sesiones (asumiendo ~4 sets por sesión)
  const lastSession1RM = Math.max(...recent.slice(0, 4).map(s => estimate1RM(s.weight_kg, s.reps)));
  const prevSession1RM = Math.max(...recent.slice(4, 8).map(s => estimate1RM(s.weight_kg, s.reps)));
  const dropPct = ((prevSession1RM - lastSession1RM) / prevSession1RM) * 100;

  if (dropPct > 5) {
    const lastWeight = recent[0].weight_kg;
    return {
      needed: true,
      reason: `Tu 1RM estimado bajó ${dropPct.toFixed(1)}% en la última sesión (${lastSession1RM.toFixed(1)} vs ${prevSession1RM.toFixed(1)}). Deload del 10%.`,
      deloadWeight: Math.round((lastWeight * 0.9) / 2.5) * 2.5
    };
  }
  return { needed: false };
}
