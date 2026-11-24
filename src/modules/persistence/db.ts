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
 *
 * BUGFIX (v0.3.1):
 *   Antes usábamos `Asset.fromModule(require('./schema.sql'))` para cargar
 *   el schema SQL desde un asset. Esto fallaba en runtime con
 *   "opendatabase cannot read property 'uri' of null" porque el asset NO
 *   estaba en assetBundlePatterns y `Asset.fromModule` devolvía un objeto
 *   con `localUri: null` y `uri: null`.
 *   Ahora importamos el SQL como string vía `?raw` (Metro raw import), que
 *   embebe el contenido directamente en el bundle JS sin pasar por el
 *   sistema de assets.
 */
import * as SQLite from "expo-sqlite";

const DB_NAME = "aio_fitness.db";

// Carga los schemas desde los archivos .ts auto-generados (con el SQL embebido
// como template string). Esto evita los problemas con Asset.fromModule y
// assetBundlePatterns.
// Para regenerar los .ts tras editar los .sql: node scripts/inline-sql.js
import schemaSql from "./schema";
import schemaPhase3Sql from "./schema_phase3";

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
    await applySchemaFile(db, schemaPhase3Sql);
    _ready = true;
  }
  return db;
}

async function applySchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await applySchemaFile(db, schemaSql);
}

/**
 * Aplica un schema SQL al database. Acepta:
 *   - string directo (caso normal con imports `?raw` o inline)
 *   - número (module ID de require, fallback legacy)
 *   - objeto con .default o .sql (por si el bundler devuelve un objeto)
 */
async function applySchemaFile(db: SQLite.SQLiteDatabase, sqlOrModule: any): Promise<void> {
  let sql: string;

  if (typeof sqlOrModule === "string") {
    // Caso ideal: import como string raw
    sql = sqlOrModule;
  } else if (sqlOrModule && typeof sqlOrModule === "object" && sqlOrModule.default) {
    // Caso: el bundler devolvió { default: "..." }
    sql = sqlOrModule.default;
  } else if (sqlOrModule && typeof sqlOrModule === "object" && sqlOrModule.sql) {
    // Caso: el bundler devolvió { sql: "..." }
    sql = sqlOrModule.sql;
  } else {
    // Último recurso: era un module ID numérico de Asset.fromModule.
    // No deberíamos llegar aquí, pero por si acaso intentamos el camino Asset.
    const { Asset } = require("expo-asset");
    const { default: FileSystem } = require("expo-file-system");
    const asset = Asset.fromModule(sqlOrModule);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) {
      throw new Error(
        "No se pudo resolver el URI del asset SQL. Asegúrate de que los archivos " +
        "*.sql están en assetBundlePatterns o usa imports raw (`?raw`)."
      );
    }
    sql = await FileSystem.readAsStringAsync(uri);
  }

  if (!sql || typeof sql !== "string" || sql.length === 0) {
    throw new Error("Schema SQL vacío o inválido tras resolución.");
  }

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
