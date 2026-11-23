/**
 * syncService.ts
 * ----------------------------------------------------------------------------
 * Drena `sync_queue` (SQLite local) hacia Supabase. Upload-only.
 *
 * Estrategia:
 *   - Lee de sync_queue LIMIT batchSize registros pendientes.
 *   - Por cada registro: obtiene el payload completo de su tabla.
 *   - Agrupa por table_name y hace upsert en lotes.
 *   - En caso de éxito: marca synced_at y elimina de la cola.
 *   - En caso de fallo: incrementa attempts y agenda reintento exponencial.
 *
 * Tablas sincronizables: workouts, sets, rep_events, body_metrics,
 *   nutrition_logs, hydration_logs, health_connect_cache, personal_records.
 */
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";
import { getSupabase } from "./supabaseClient";
import { getCachedDeviceId } from "./deviceIdentity";

const BATCH_SIZE = parseInt(process.env.EXPO_PUBLIC_SYNC_BATCH_SIZE ?? "100", 10);

const SYNCABLE_TABLES = [
  "workouts",
  "sets",
  "rep_events",
  "body_metrics",
  "nutrition_logs",
  "hydration_logs",
  "health_connect_cache",
  "personal_records"
] as const;

type TableName = typeof SYNCABLE_TABLES[number];

// Columnas que cada tabla expone para el upsert (deben coincidir con Supabase).
const TABLE_COLUMNS: Record<TableName, string[]> = {
  workouts: ["id", "device_id", "name", "notes", "started_at", "ended_at",
    "duration_sec", "total_volume_kg", "status", "exercise_order",
    "created_at", "updated_at", "synced_at"],
  sets: ["id", "device_id", "workout_id", "exercise_id", "set_index",
    "weight_kg", "reps", "partial_reps", "rpe", "tempo_sec", "rest_sec",
    "est_1rm_kg", "volume_kg", "pose_summary", "video_path",
    "created_at", "updated_at", "synced_at"],
  rep_events: ["id", "device_id", "set_id", "rep_index", "eccentric_ms",
    "pause_ms", "concentric_ms", "rom_degrees", "full_rom", "biomechanics",
    "timestamp_ms", "created_at"],
  body_metrics: ["id", "device_id", "weight_kg", "body_fat_pct",
    "muscle_mass_kg", "bone_mass_kg", "water_mass_kg", "chest_cm", "waist_cm",
    "hip_cm", "arm_cm", "thigh_cm", "notes", "source", "measured_at",
    "created_at", "updated_at", "synced_at"],
  nutrition_logs: ["id", "device_id", "day", "meal_name", "kcal", "protein_g",
    "carbs_g", "fat_g", "fiber_g", "is_supplement", "logged_at",
    "created_at", "updated_at", "synced_at"],
  hydration_logs: ["id", "device_id", "day", "ml", "logged_at",
    "created_at", "updated_at", "synced_at"],
  health_connect_cache: ["id", "device_id", "metric_type", "day",
    "started_at", "ended_at", "value", "unit", "source_app", "raw_meta",
    "ingested_at"],
  personal_records: ["id", "device_id", "exercise_id", "record_type", "value",
    "achieved_at", "set_id", "created_at"]
};

export interface SyncRunResult {
  pushed: number;
  failed: number;
  errorMessage?: string;
}

/**
 * Drena una tanda de sync_queue. Devuelve el número de registros subidos.
 * El sync worker invoca esto en bucle hasta que devuelva pushed=0.
 */
export async function drainSyncQueue(): Promise<SyncRunResult> {
  const db = await openDatabase();
  const deviceId = getCachedDeviceId();

  // 1) Leer pendientes
  const pending = await queryAsync<{
    id: number;
    table_name: TableName;
    record_id: string;
    operation: string;
    attempts: number;
  }>(
    db,
    `SELECT id, table_name, record_id, operation, attempts
     FROM sync_queue
     WHERE synced_at IS NULL AND next_retry_at <= ?
     ORDER BY queued_at ASC
     LIMIT ?`,
    [Date.now(), BATCH_SIZE]
  );

  if (pending.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  const supabase = await getSupabase();

  // 2) Agrupar por tabla
  const byTable = new Map<TableName, { queueId: number; recordId: string }[]>();
  for (const p of pending) {
    if (!SYNCABLE_TABLES.includes(p.table_name)) continue;
    const arr = byTable.get(p.table_name) ?? [];
    arr.push({ queueId: p.id, recordId: p.record_id });
    byTable.set(p.table_name, arr);
  }

  let pushed = 0;
  let failed = 0;
  let lastError: string | undefined;

  // 3) Procesar cada tabla en batch
  for (const [table, items] of byTable.entries()) {
    const cols = TABLE_COLUMNS[table];
    const placeholders = items.map(() => "?").join(",");
    const sql = `SELECT ${cols.join(", ")} FROM ${table} WHERE id IN (${placeholders})`;
    const rows = await queryAsync<any>(db, sql, items.map((i) => i.recordId));

    // Normalizar tipos: SQLite guarda JSON como TEXT; hay que parsear a object.
    const normalized = rows.map((row) => normalizeRow(table, row, deviceId));

    if (normalized.length === 0) continue;

    try {
      const { error } = await supabase
        .from(table)
        .upsert(normalized, { onConflict: "id", ignoreDuplicates: false });

      if (error) throw error;

      // Marcar synced_at en la cola y en la tabla de origen
      const queueIds = items.map((i) => i.queueId);
      const now = Date.now();
      await execAsync(
        db,
        `UPDATE sync_queue SET synced_at = ? WHERE id IN (${queueIds.map(() => "?").join(",")})`,
        [now, ...queueIds]
      );
      // Marcar también synced_at en la fila original (para que sepamos que ya está arriba)
      if (TABLE_COLUMNS[table].includes("synced_at")) {
        await execAsync(
          db,
          `UPDATE ${table} SET synced_at = ? WHERE id IN (${items.map(() => "?").join(",")})`,
          [now, ...items.map((i) => i.recordId)]
        );
      }
      pushed += items.length;
    } catch (err: any) {
      failed += items.length;
      lastError = err?.message ?? String(err);
      // Backoff exponencial: 30s * 2^attempts, máximo 30 min
      const delay = Math.min(30 * 60_000, 30_000 * Math.pow(2, items[0] ? 1 : 1));
      const nextRetry = Date.now() + delay;
      const queueIds = items.map((i) => i.queueId);
      await execAsync(
        db,
        `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, next_retry_at = ?
         WHERE id IN (${queueIds.map(() => "?").join(",")})`,
        [lastError, nextRetry, ...queueIds]
      );
    }
  }

  // 4) Log de la corrida (opcional, ayuda a depurar)
  await logSyncRun(db, deviceId, pushed, failed, lastError);

  return { pushed, failed, errorMessage: lastError };
}

// --- Helpers ---------------------------------------------------------------

function normalizeRow(table: TableName, row: any, deviceId: string): any {
  const out: any = {};
  for (const col of TABLE_COLUMNS[table]) {
    let v = row[col];
    if (col === "device_id") {
      out[col] = deviceId;
      continue;
    }
    // Columnas JSON: deben ir como objeto, no como string
    if (["tempo_sec", "pose_summary", "exercise_order", "biomechanics", "raw_meta"].includes(col)) {
      out[col] = typeof v === "string" && v ? JSON.parse(v) : v;
      continue;
    }
    // Booleanos: SQLite guarda 0/1
    if (["full_rom", "is_supplement"].includes(col)) {
      out[col] = !!v;
      continue;
    }
    // Timestamps: SQLite guarda ms epoch; Supabase espera ISO string
    if (["started_at", "ended_at", "measured_at", "logged_at", "achieved_at",
         "created_at", "updated_at", "synced_at", "ingested_at"].includes(col)) {
      out[col] = typeof v === "number" ? new Date(v).toISOString() : v;
      continue;
    }
    out[col] = v;
  }
  return out;
}

async function logSyncRun(db: any, deviceId: string, pushed: number, failed: number, err?: string) {
  try {
    const supabase = await getSupabase();
    await supabase.from("sync_log").insert({
      device_id: deviceId,
      table_name: "_batch",
      records_pushed: pushed,
      status: failed > 0 ? "error" : "ok",
      error_message: err ?? null
    });
  } catch {
    // El log es best-effort
  }
}

/**
 * Cuenta cuántos registros hay pendientes. Lo usa el HUD para mostrar
 * "Pendiente subir: 12 registros" en la pantalla de Datos.
 */
export async function countPending(): Promise<number> {
  const db = await openDatabase();
  const row = await queryAsync<{ cnt: number }>(
    db,
    "SELECT COUNT(*) as cnt FROM sync_queue WHERE synced_at IS NULL",
    []
  );
  return row[0]?.cnt ?? 0;
}
