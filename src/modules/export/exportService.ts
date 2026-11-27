/**
 * exportService.ts
 * ----------------------------------------------------------------------------
 * Exportación de datos en JSON y CSV.
 *   - Modalidad A: workout puntual (1 archivo con series+reps+biomecánica).
 *   - Modalidad B: backup completo por tabla desde ajustes.
 *
 * Usa expo-file-system + expo-sharing para guardar/compartir el archivo.
 */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { openDatabase, queryAsync } from "@/modules/persistence/db";

const EXPORT_DIR = FileSystem.documentDirectory + "exports/";

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(EXPORT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  }
}

// --- Modalidad A: workout puntual -----------------------------------------
export async function exportWorkoutAsJson(workoutId: string): Promise<string> {
  await ensureDir();
  const db = await openDatabase();
  const [workout, sets, reps] = await Promise.all([
    queryAsync<any>(db, "SELECT * FROM workouts WHERE id = ?", [workoutId]),
    queryAsync<any>(db, "SELECT * FROM sets WHERE workout_id = ?", [workoutId]),
    queryAsync<any>(db, `SELECT re.* FROM rep_events re
      JOIN sets s ON s.id = re.set_id WHERE s.workout_id = ?`, [workoutId])
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: "0.3.0",
    workout: workout[0],
    sets: sets.map(s => ({
      ...s,
      tempo_sec: s.tempo_sec ? JSON.parse(s.tempo_sec) : null,
      pose_summary: s.pose_summary ? JSON.parse(s.pose_summary) : null
    })),
    repEvents: reps.map(r => ({
      ...r,
      biomechanics: r.biomechanics ? JSON.parse(r.biomechanics) : null
    }))
  };

  const filename = `workout_${workoutId}_${Date.now()}.json`;
  const path = EXPORT_DIR + filename;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Exportar entreno" });
  return path;
}

export async function exportWorkoutAsCsv(workoutId: string): Promise<string> {
  await ensureDir();
  const db = await openDatabase();
  const sets = await queryAsync<any>(db, "SELECT * FROM sets WHERE workout_id = ?", [workoutId]);
  if (sets.length === 0) throw new Error("Sin series para exportar");

  const headers = [
    "set_id", "exercise_id", "set_index", "weight_kg", "reps", "partial_reps",
    "rpe", "tempo_eccentric_sec", "tempo_concentric_sec", "rest_sec",
    "est_1rm_kg", "volume_kg", "faults", "created_at"
  ];
  const lines = [headers.join(",")];
  for (const s of sets) {
    let tempo = { eccentric: "", concentric: "" };
    try { if (s.tempo_sec) tempo = JSON.parse(s.tempo_sec); } catch {}
    let faults = "";
    try { if (s.pose_summary) faults = JSON.parse(s.pose_summary).faultsDetected?.join(";") ?? ""; } catch {}
    const row = [
      s.id, s.exercise_id, s.set_index, s.weight_kg, s.reps, s.partial_reps,
      s.rpe ?? "", tempo.eccentric ?? "", tempo.concentric ?? "", s.rest_sec ?? "",
      s.est_1rm_kg ?? "", s.volume_kg ?? "", `"${faults}"`, new Date(s.created_at).toISOString()
    ];
    lines.push(row.join(","));
  }

  const filename = `workout_${workoutId}_${Date.now()}.csv`;
  const path = EXPORT_DIR + filename;
  await FileSystem.writeAsStringAsync(path, lines.join("\n"));
  await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Exportar entreno CSV" });
  return path;
}

// --- Modalidad B: backup completo por tabla --------------------------------
const BACKUP_TABLES = [
  "workouts", "sets", "rep_events", "body_metrics",
  "nutrition_logs", "hydration_logs", "supplement_logs",
  "health_connect_cache", "personal_records", "routines",
  "foods", "periodization_cycles", "weekly_meal_plan",
  "set_state_tags", "set_recordings"
];

export async function exportFullBackupAsJson(): Promise<string> {
  await ensureDir();
  const db = await openDatabase();
  const payload: Record<string, any> = {};
  for (const t of BACKUP_TABLES) {
    payload[t] = await queryAsync<any>(db, `SELECT * FROM ${t}`, []);
  }
  payload._meta = {
    exportedAt: new Date().toISOString(),
    appVersion: "0.3.0",
    tableCount: BACKUP_TABLES.length
  };
  const filename = `aio_backup_${new Date().toLocaleDateString("sv-SE")}.json`;
  const path = EXPORT_DIR + filename;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Backup completo JSON" });
  return path;
}

export async function exportTableAsCsv(tableName: string): Promise<string> {
  await ensureDir();
  const db = await openDatabase();
  const rows = await queryAsync<any>(db, `SELECT * FROM ${tableName}`, []);
  if (rows.length === 0) throw new Error(`Tabla ${tableName} vacía`);
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) {
    const row = headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v.replace(/"/g, '""') : String(v);
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(row.join(","));
  }
  const filename = `${tableName}_${new Date().toLocaleDateString("sv-SE")}.csv`;
  const path = EXPORT_DIR + filename;
  await FileSystem.writeAsStringAsync(path, lines.join("\n"));
  await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: `Exportar ${tableName}` });
  return path;
}
