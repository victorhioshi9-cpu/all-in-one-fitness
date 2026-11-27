/**
 * restRecommendation.ts — Descanso sugerido al cumplir el objetivo de la serie.
 * Rangos habituales: fuerza 2–5 min, hipertrofia 1,5–3 min, resistencia 30–90 s.
 * Son una guía general, no una prescripción individual.
 */
import type { ExercisePreset } from "@/modules/biomechanics/exercisePresets";

export type TrainingGoal = "strength" | "hypertrophy" | "endurance";

export const GOAL_META: Record<TrainingGoal, { label: string; emoji: string; hint: string }> = {
  strength:    { label: "Fuerza",      emoji: "🏋️", hint: "1–5 reps pesadas" },
  hypertrophy: { label: "Hipertrofia", emoji: "💪", hint: "6–12 reps" },
  endurance:   { label: "Resistencia", emoji: "🔥", hint: "15+ reps" }
};

const ISOLATION = /extension|curl|raise|fly|pushdown|kickback|calf|crunch|twist|abductor|face_pull|upright/;
const COMPOUND = /squat|deadlift|press|row|pull|lunge|push_up|dip|thrust|burpee|step_up|swing/;

export function isCompound(p: ExercisePreset): boolean {
  if (ISOLATION.test(p.id)) return false;
  return COMPOUND.test(p.id);
}

export function recommendRestSeconds(goal: TrainingGoal, compound: boolean, hardSet = false): number {
  const base = { strength: 180, hypertrophy: 105, endurance: 45 }[goal];
  const raw = base * (compound ? 1 : 0.7) * (hardSet ? 1.25 : 1);
  return Math.round(raw / 15) * 15;   // múltiplos de 15 s
}

export function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s} s`;
}
