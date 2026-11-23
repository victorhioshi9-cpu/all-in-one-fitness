/**
 * db.ts - Inicialización de SQLite (expo-sqlite) con schema offline-first.
 *
 * - Abre la BD de forma perezosa.
 * - Aplica el schema.sql completo la primera vez.
 * - Expone `execute`, `query`, `queryFirst` con tipos.
 * - Preparado para Fase 2: un watcher que drena `sync_queue` cuando hay red.
 */
import * as SQLite from "expo-sqlite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const DB_NAME = "aio_fitness.db";
const SCHEMA_BUNDLE_PATH = require("./schema.sql");

let _db: SQLite.WebSQLDatabase | null = null;
let _ready = false;

export async function openDatabase(): Promise<SQLite.WebSQLDatabase> {
  if (_db) return _db;

  // expo-sqlite (v13+) abre sin await; v14 cambia la API.
  // Este wrapper cubre ambos.
  const db = SQLite.openDatabase(DB_NAME);
  _db = db;

  if (!_ready) {
    await applySchema(db);
    // Aplicar migraciones Fase 3 (idempotentes con IF NOT EXISTS)
    await applySchemaFile(db, require("./schema_phase3.sql"));
    _ready = true;
  }
  return db;
}

async function applySchema(db: SQLite.WebSQLDatabase): Promise<void> {
  await applySchemaFile(db, SCHEMA_BUNDLE_PATH);
}

async function applySchemaFile(db: SQLite.WebSQLDatabase, bundlePath: any): Promise<void> {
  const asset = Asset.fromModule(bundlePath);
  await asset.downloadAsync();
  const sql = await FileSystem.readAsStringAsync(asset.localUri || asset.uri);
  await new Promise<void>((resolve, reject) => {
    db.exec(
      [{ sql: sql, args: [] }],
      false,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Helpers tipados -----------------------------------------------------------
export function execAsync(db: SQLite.WebSQLDatabase, sql: string, args: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec([{ sql, args }], false, (err) => (err ? reject(err) : resolve()));
  });
}

export function queryAsync<T = any>(
  db: SQLite.WebSQLDatabase,
  sql: string,
  args: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.exec([{ sql, args }], true, (err, resultSets) => {
      if (err) return reject(err);
      const rows = resultSets?.[0]?.rows || [];
      resolve(rows as T[]);
    });
  });
}

export function queryFirstAsync<T = any>(
  db: SQLite.WebSQLDatabase,
  sql: string,
  args: any[] = []
): Promise<T | null> {
  return queryAsync<T>(db, sql, args).then((rows) => rows[0] ?? null);
}
