// AUTO-GENERADO por scripts/inline-sql.js. NO EDITAR A MANO.
// Re-generar con: node scripts/inline-sql.js
// Origen: src/modules/persistence/schema.sql
export default `-- ============================================================================
-- All-in-One Fitness - Esquema SQLite local (Offline-First)
-- ============================================================================
-- Diseño:
--   - Cualquier registro de serie, nutrición, hidratación, métrica corporal o
--     sesión de pose-tracking se escribe aquí SIN red. Latencia ~5ms.
--   - sync_queue acumula los cambios pendientes para empujarlos a la nube
--     (PostgreSQL/Supabase) en segundo plano cuando hay red.
--   - Todos los registros tienen \`updated_at\` y \`synced_at\` (NULL = pendiente).
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;          -- mejor throughput de escritura
PRAGMA synchronous = NORMAL;        -- compromete durabilidad por velocidad (aceptable en fitness)

-- ---------------------------------------------------------------------------
-- Catálogo de ejercicios (predefinidos + custom del usuario)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,            -- 'free_weight' | 'machine' | 'cable' | 'calisthenic' | 'cardio'
  primary_muscle  TEXT,
  secondary_muscles TEXT,                   -- JSON array string
  -- Configuración biomecánica: qué landmarks vigilar, articulaciones clave, umbrales
  pose_config     TEXT,                     -- JSON: { trackedJoints: [...], stateMachine: {...}, faults: [...] }
  is_custom       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);

-- ---------------------------------------------------------------------------
-- Rutinas / Plantillas de entrenamiento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workouts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  notes           TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  duration_sec    INTEGER,
  total_volume_kg REAL,
  -- 'in_progress' | 'completed' | 'abandoned'
  status          TEXT NOT NULL DEFAULT 'in_progress',
  -- JSON con array de exercise_ids y orden
  exercise_order  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts(status);

-- ---------------------------------------------------------------------------
-- Series registradas (núcleo del gimnasio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sets (
  id              TEXT PRIMARY KEY,
  workout_id      TEXT NOT NULL,
  exercise_id     TEXT NOT NULL,
  set_index       INTEGER NOT NULL,
  weight_kg       REAL NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL DEFAULT 0,
  -- Reps detectadas como incompletas (ROM corto) por el AI Coach
  partial_reps    INTEGER NOT NULL DEFAULT 0,
  rpe             REAL,                     -- Rate of Perceived Exertion (1-10)
  -- Tempo en segundos: { eccentric: 2.1, concentric: 1.4 }
  tempo_sec       TEXT,
  rest_sec        INTEGER,
  -- 1RM estimado con esa serie (Epley)
  est_1rm_kg      REAL,
  volume_kg       REAL,
  -- Biomecánica cruda para revisión posterior
  pose_summary    TEXT,                     -- JSON: { faultsDetected: [...], avgAngles: {...} }
  video_path      TEXT,
  -- Sincronización
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id, set_index);
CREATE INDEX IF NOT EXISTS idx_sets_exercise_created ON sets(exercise_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Eventos crudos por repetición (para análisis fino de fatiga y comparación)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rep_events (
  id              TEXT PRIMARY KEY,
  set_id          TEXT NOT NULL,
  rep_index       INTEGER NOT NULL,
  -- Tiempos por fase en ms
  eccentric_ms    INTEGER,
  pause_ms        INTEGER,
  concentric_ms   INTEGER,
  -- ROM en grados del ángulo articular principal
  rom_degrees     REAL,
  -- ¿Rep completa (true) o media rep (false)?
  full_rom        INTEGER NOT NULL,
  -- JSON con los ángulos máximos/mínimos y fallos detectados
  biomechanics    TEXT,
  timestamp_ms    INTEGER NOT NULL,
  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rep_events_set ON rep_events(set_id, rep_index);

-- ---------------------------------------------------------------------------
-- Métricas corporales (peso, medidas, composición)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS body_metrics (
  id              TEXT PRIMARY KEY,
  weight_kg       REAL,
  body_fat_pct    REAL,
  muscle_mass_kg  REAL,
  -- Medidas en cm
  chest_cm        REAL,
  waist_cm        REAL,
  hip_cm          REAL,
  arm_cm          REAL,
  thigh_cm        REAL,
  notes           TEXT,
  -- Fuente: 'manual' | 'health_connect' | 'mi_fitness'
  source          TEXT NOT NULL DEFAULT 'manual',
  measured_at     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_body_metrics_measured ON body_metrics(measured_at DESC);

-- ---------------------------------------------------------------------------
-- Nutrición e hidratación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id              TEXT PRIMARY KEY,
  -- ISO date 'YYYY-MM-DD'
  day             TEXT NOT NULL,
  meal_name       TEXT,
  kcal            REAL NOT NULL DEFAULT 0,
  protein_g       REAL DEFAULT 0,
  carbs_g         REAL DEFAULT 0,
  fat_g           REAL DEFAULT 0,
  fiber_g         REAL DEFAULT 0,
  is_supplement   INTEGER NOT NULL DEFAULT 0,
  logged_at       INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_nutrition_day ON nutrition_logs(day);

CREATE TABLE IF NOT EXISTS hydration_logs (
  id              TEXT PRIMARY KEY,
  day             TEXT NOT NULL,
  ml              INTEGER NOT NULL,
  logged_at       INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hydration_day ON hydration_logs(day);

-- ---------------------------------------------------------------------------
-- Datos importados de Health Connect (Mi Fitness vía HC)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_connect_cache (
  id              TEXT PRIMARY KEY,
  metric_type     TEXT NOT NULL,            -- 'steps' | 'heart_rate' | 'active_kcal' | 'basal_kcal' | 'sleep' | 'weight' | 'workout'
  day             TEXT,                     -- 'YYYY-MM-DD' para diarios
  started_at      INTEGER,                  -- ms timestamp para instantes/sesiones
  ended_at        INTEGER,
  value           REAL,
  unit            TEXT,
  -- Para evitar duplicados al sincronizar desde Mi Fitness vía Health Connect
  source_app      TEXT,                     -- 'com.xiaomi.wearable' | 'com.google.android.apps.fitness' | ...
  raw_meta        TEXT,                     -- JSON con metadata completa del record de HC
  ingested_at     INTEGER NOT NULL,
  UNIQUE(metric_type, day, started_at, source_app)
);

CREATE INDEX IF NOT EXISTS idx_hc_metric_day ON health_connect_cache(metric_type, day);

-- ---------------------------------------------------------------------------
-- Récords personales y resúmenes precomputados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personal_records (
  id              TEXT PRIMARY KEY,
  exercise_id     TEXT NOT NULL,
  -- '1rm' | 'max_weight' | 'max_reps' | 'max_volume'
  record_type     TEXT NOT NULL,
  value           REAL NOT NULL,
  achieved_at     INTEGER NOT NULL,
  set_id          TEXT,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pr_exercise_type ON personal_records(exercise_id, record_type);

-- ---------------------------------------------------------------------------
-- Cola de sincronización (Offline -> Cloud)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  operation       TEXT NOT NULL,            -- 'upsert' | 'delete'
  payload         TEXT,                     -- JSON del registro completo
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  queued_at       INTEGER NOT NULL,
  next_retry_at   INTEGER NOT NULL,
  synced_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced_at, next_retry_at);

-- ---------------------------------------------------------------------------
-- Ajustes del usuario (preferencias, calibración)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Triggers: cualquier INSERT/UPDATE encola en sync_queue
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_sets_upsert
AFTER INSERT ON sets
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('sets', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_workouts_upsert
AFTER INSERT ON workouts
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('workouts', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_body_metrics_upsert
AFTER INSERT ON body_metrics
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('body_metrics', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;
`;
