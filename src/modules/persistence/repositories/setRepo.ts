/**
 * setRepo.ts - Repositorio de series (escribe en SQLite + encola sync_queue).
 * Fase 1: implementación funcional. La sincronización cloud se activa en Fase 2.
 */
import { openDatabase, execAsync, queryAsync } from "../db";

export interface PersistedSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  partial_reps: number;
  rpe?: number;
  tempo_sec?: string;
  est_1rm_kg?: number;
  volume_kg?: number;
  pose_summary?: string;
  created_at: number;
  updated_at: number;
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Calcula 1RM por fórmula de Epley: 1RM = w * (1 + r/30)
 */
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export async function persistSet(input: {
  workoutId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  partialReps?: number;
  rpe?: number;
  tempoSec?: { eccentric: number; concentric: number };
  poseSummary?: any;
}): Promise<PersistedSet> {
  const db = await openDatabase();
  const id = uid();
  const now = Date.now();
  const tempoJson = input.tempoSec ? JSON.stringify(input.tempoSec) : null;
  const poseJson = input.poseSummary ? JSON.stringify(input.poseSummary) : null;
  const est1rm = estimate1RM(input.weightKg, input.reps);
  const volume = input.weightKg * input.reps;

  await execAsync(
    db,
    `INSERT INTO sets
      (id, workout_id, exercise_id, set_index, weight_kg, reps, partial_reps,
       rpe, tempo_sec, rest_sec, est_1rm_kg, volume_kg, pose_summary, video_path,
       created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL)`,
    [
      id, input.workoutId, input.exerciseId, input.setIndex,
      input.weightKg, input.reps, input.partialReps ?? 0,
      input.rpe ?? null, tempoJson,
      est1rm, volume, poseJson,
      now, now
    ]
  );

  const row = await queryAsync<PersistedSet>(
    db,
    "SELECT * FROM sets WHERE id = ?",
    [id]
  );
  return row[0];
}

export async function getRecentSets(exerciseId: string, limit = 5): Promise<PersistedSet[]> {
  const db = await openDatabase();
  return queryAsync<PersistedSet>(
    db,
    "SELECT * FROM sets WHERE exercise_id = ? ORDER BY created_at DESC LIMIT ?",
    [exerciseId, limit]
  );
}
