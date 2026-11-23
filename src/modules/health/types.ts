/**
 * types.ts - Tipos y constantes de Health Connect.
 * ----------------------------------------------------------------------------
 * Definimos los RecordTypes que vamos a leer/escribir. La librería
 * `react-native-health-connect` v3+ los expone como string literals
 * que coinciden con los de Android Jetpack Health Connect.
 */
export type RecordType =
  | "Steps"
  | "HeartRate"
  | "ActiveCaloriesBurned"
  | "BasalMetabolicRate"
  | "SleepSession"
  | "Weight"
  | "BodyFat"
  | "Height"
  | "HeartRateVariabilityRmssd"
  | "Hydration"
  | "ExerciseSession";  // para escribir nuestras sesiones de entrenamiento

/**
 * Tipos que pedimos leer. Mi Fitness (com.xiaomi.wearable) escribe la mayoría
 * de estos. Algunos como BodyFat y Weight los escribe la Xiaomi S400 Scale
 * que sincroniza con el reloj Xiaomi y luego con Mi Fitness.
 *
 * Nota: LeanBodyMass, BoneMass, BodyWaterMass no son tipos estándar de HC
 * hasta versiones muy recientes. Para compatibilidad máxima los derivamos
 * de Weight + BodyFat cuando no existen como tipo propio.
 */
export const READ_PERMISSIONS: RecordType[] = [
  "Steps",
  "HeartRate",
  "ActiveCaloriesBurned",
  "BasalMetabolicRate",
  "SleepSession",
  "Weight",
  "BodyFat",
  "Height",
  "HeartRateVariabilityRmssd",
  "Hydration"
];

/** Tipos que escribimos hacia Health Connect. */
export const WRITE_PERMISSIONS: RecordType[] = [
  "ExerciseSession",
  "Weight",
  "ActiveCaloriesBurned",
  "Steps"
];

/**
 * Source app IDs prioritarios (en orden de preferencia).
 * Mi Fitness reporta `com.xiaomi.wearable`. Otros sources aceptados como
 * secundarios (no se descartan, pero se marcan como prioridad menor).
 */
export const PREFERRED_SOURCES = [
  "com.xiaomi.wearable",     // Mi Fitness / Xiaomi Watch
  "com.xiaomi.hm.health",    // versión antigua de Mi Fit
  "com.google.android.apps.fitness",  // Google Fit (fallback)
  "com.samsung.android.shealth"        // Samsung Health (fallback)
];

/** ¿Es este source uno de los prioritarios (Mi Fitness)? */
export function isPreferredSource(appId: string | undefined): boolean {
  if (!appId) return false;
  return PREFERRED_SOURCES.slice(0, 2).includes(appId);
}

export interface HealthRecord {
  recordType: RecordType;
  /** App que escribió el dato (p.ej. com.xiaomi.wearable). */
  sourceApp?: string;
  /** ISO date 'YYYY-MM-DD' para diarios. */
  day?: string;
  startedAt: number;   // ms epoch
  endedAt?: number;    // ms epoch
  value: number;
  unit: string;
  rawMeta?: Record<string, any>;
}

export type Availability =
  | "installed"
  | "not_installed"
  | "checking"
  | "unknown";

export type PermissionState =
  | "granted"
  | "denied"
  | "partial"
  | "not_requested";
