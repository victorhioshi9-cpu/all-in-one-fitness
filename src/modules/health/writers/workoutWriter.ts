/**
 * workoutWriter.ts
 * ----------------------------------------------------------------------------
 * Escribe ExerciseSessionRecord en Health Connect desde nuestras sesiones.
 *
 * Beneficio: que Google Fit / Samsung Health / otras apps reconozcan el
 * entrenamiento que hiciste dentro de All-in-One Fitness y lo sumen a tu
 * gasto calórico diario.
 *
 * Si Mi Fitness también lee ExerciseSessionRecords (depende de versión), tu
 * entrenamiento aparecerá en Mi Fitness como actividad.
 *
 * Estructura de ExerciseSessionRecord en react-native-health-connect v3+:
 *   {
 *     startTime, endTime,
 *     exerciseType: 'STRENGTH_TRAINING' | 'WEIGHTLIFTING' | etc,
 *     title: 'Sentadilla - 4x8 @ 60kg',
 *     metadata: { recordingMethod: 'RECORDING_METHOD_AUTOMATICALLY_RECORDED', ... }
 *   }
 *
 * También escribimos un ActiveCaloriesBurnedRecord asociado para que el gasto
 * calórico estimado (calculado con METs) cuente.
 */
import { insertRecords } from "react-native-health-connect";
import { getCachedDeviceId } from "@/modules/cloud/deviceIdentity";
import { openDatabase, queryAsync } from "@/modules/persistence/db";

interface WorkoutToWrite {
  workoutId: string;
  startedAtMs: number;
  endedAtMs: number;
  totalVolumeKg: number;
  /** Calorías estimadas con MET ~5 para peso training moderado. */
  estimatedKcal: number;
  /** Título legible: "Sentadilla + Curl - 4x8 @ 60kg". */
  title: string;
}

const STRENGTH_TRAINING_MET = 5.0; // METs de weightlifting moderado

/**
 * Calcula kcal gastadas en una sesión de pesas:
 *   kcal = MET * peso_kg * horas
 */
export function estimateWorkoutCalories(durationMin: number, bodyWeightKg: number): number {
  const hours = durationMin / 60;
  return Math.round(STRENGTH_TRAINING_MET * bodyWeightKg * hours);
}

/**
 * Escribe una sesión de entreno completa a Health Connect.
 * Devuelve los IDs de los records creados (vacío si falló).
 */
export async function writeWorkoutToHealthConnect(
  workout: WorkoutToWrite
): Promise<string[]> {
  const records: any[] = [
    {
      type: "ExerciseSession",
      startTime: workout.startedAtMs,
      endTime: workout.endedAtMs,
      exerciseType: "STRENGTH_TRAINING",
      title: workout.title,
      metadata: {
        recordingMethod: "RECORDING_METHOD_MANUALLY_RECORDED",
        clientRecordId: `aio-${workout.workoutId}`,
        clientRecordVersion: 1
      }
    },
    {
      type: "ActiveCaloriesBurned",
      startTime: workout.startedAtMs,
      endTime: workout.endedAtMs,
      energy: { inCalories: workout.estimatedKcal },
      metadata: {
        recordingMethod: "RECORDING_METHOD_MANUALLY_RECORDED",
        clientRecordId: `aio-kcal-${workout.workoutId}`,
        clientRecordVersion: 1
      }
    }
  ];

  try {
    const result = await insertRecords(records as any);
    return Array.isArray(result) ? result.map((r: any) => r.id ?? r.uuid) : [];
  } catch (err) {
    console.error("[healthConnect] writeWorkoutToHealthConnect failed:", err);
    return [];
  }
}

/**
 * Toma el último workout marcado como 'completed' en SQLite y lo sube a HC.
 * Lo invoca el sync worker tras finalizar la sesión.
 */
export async function pushLastWorkoutToHealthConnect(): Promise<boolean> {
  const db = await openDatabase();
  const deviceId = getCachedDeviceId();

  const lastWorkout = await queryAsync<any>(
    db,
    `SELECT * FROM workouts WHERE status = 'completed' AND ended_at IS NOT NULL
     ORDER BY ended_at DESC LIMIT 1`,
    []
  );
  if (lastWorkout.length === 0) return false;
  const w = lastWorkout[0];

  // Construir título con los top exercises
  const sets = await queryAsync<any>(
    db,
    `SELECT s.exercise_id, e.name as exercise_name, SUM(s.volume_kg) as volume
     FROM sets s LEFT JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_id = ?
     GROUP BY s.exercise_id
     ORDER BY volume DESC
     LIMIT 3`,
    [w.id]
  );
  const title = sets.map((s: any) => s.exercise_name ?? s.exercise_id).join(" + ")
    || `Workout ${new Date(w.started_at).toLocaleDateString()}`;

  const durationMin = w.ended_at && w.started_at
    ? Math.round((w.ended_at - w.started_at) / 60_000)
    : 60;

  // Necesitamos el peso corporal para estimar kcal. Último peso conocido.
  const lastWeight = await queryAsync<any>(
    db,
    "SELECT weight_kg FROM body_metrics WHERE weight_kg IS NOT NULL ORDER BY measured_at DESC LIMIT 1",
    []
  );
  const bodyWeight = lastWeight[0]?.weight_kg ?? 75; // fallback 75kg

  const ids = await writeWorkoutToHealthConnect({
    workoutId: w.id,
    startedAtMs: w.started_at,
    endedAtMs: w.ended_at,
    totalVolumeKg: w.total_volume_kg ?? 0,
    estimatedKcal: estimateWorkoutCalories(durationMin, bodyWeight),
    title: `${title} - ${Math.round(w.total_volume_kg ?? 0)}kg total`
  });

  return ids.length > 0;
}
