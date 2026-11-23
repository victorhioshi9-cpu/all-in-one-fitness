/**
 * db.ts - Inicialización de SQLite (expo-sqlite v14+) con schema offline-first.
 *
 * CAMBIO IMPORTANTE (v13 -> v14):
 *   - SQLite.openDatabase(name)            ❌ eliminado en v14
 *   - SQLite.openDatabaseAsync(name)       ✅ devuelve Promise<SQLiteDatabase>
 *   - db.exec([{sql,args}], readOnly, cb)  ❌ eliminado en v14
 *   - db.execAsync(source)                 ✅ ejecuta 1+ statements sin bind
 *   - db.runAsync(source, ...params)       ✅ INSERT/UPDATE/DELETE con bind
 *   - db.getAllAsync<T>(source, ...params) ✅ SELECT con bind, devuelve T[]
 *   - SQLite.WebSQLDatabase                ❌ eliminado en v14
 *   - SQLite.SQLiteDatabase                ✅ nuevo tipo
 *
 * - Abre la BD de forma perezosa.
 * - Aplica el schema.sql completo la primera vez.
 * - Expone `execAsync`, `queryAsync`, `queryFirstAsync` con tipos.
 */
import * as SQLite from "expo-sqlite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const DB_NAME = "aio_fitness.db";
const SCHEMA_BUNDLE_PATH = require("./schema.sql");

let _db: SQLite.SQLiteDatabase | null = null;
let _ready = false;

export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  // v14: openDatabaseAsync devuelve una Promise que hay que await.
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  _db = db;

  if (!_ready) {
    await applySchema(db);
    // Aplicar migraciones Fase 3 (idempotentes con IF NOT EXISTS)
    await applySchemaFile(db, require("./schema_phase3.sql"));
    _ready = true;
  }
  return db;
}

async function applySchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await applySchemaFile(db, SCHEMA_BUNDLE_PATH);
}

async function applySchemaFile(db: SQLite.SQLiteDatabase, bundlePath: any): Promise<void> {
  const asset = Asset.fromModule(bundlePath);
  await asset.downloadAsync();
  const sql = await FileSystem.readAsStringAsync(asset.localUri || asset.uri);
  // v14: execAsync acepta un string con varios statements separados por ';'.
  await db.execAsync(sql);
}

// Helpers tipados -----------------------------------------------------------
/**
 * Ejecuta un INSERT / UPDATE / DELETE / DDL con bind params.
 * Para statements múltiples sin bind, usa db.execAsync(sql) directamente.
 */
export function execAsync(
  db: SQLite.SQLiteDatabase,
  sql: string,
  args: any[] = []
): Promise<void> {
  // v14: runAsync acepta params como array o variadic. Usamos array.
  return db.runAsync(sql, args).then(() => undefined);
}

/**
 * Ejecuta un SELECT y devuelve las filas tipadas.
 * En v14 getAllAsync devuelve directamente el array de filas
 * (no hay envoltorio resultSets[0].rows).
 */
export function queryAsync<T = any>(
  db: SQLite.SQLiteDatabase,
  sql: string,
  args: any[] = []
): Promise<T[]> {
  return db.getAllAsync<T>(sql, args);
}

export function queryFirstAsync<T = any>(
  db: SQLite.SQLiteDatabase,
  sql: string,
  args: any[] = []
): Promise<T | null> {
  return queryAsync<T>(db, sql, args).then((rows) => rows[0] ?? null);
}
