// AUTO-GENERADO por scripts/inline-sql.js. NO EDITAR A MANO.
// Re-generar con: node scripts/inline-sql.js
// Origen: src/modules/persistence/schema_phase3.sql
export default `-- ============================================================================
-- Fase 3 - Tablas adicionales (se aplican sobre el schema.sql de Fase 1)
-- ============================================================================

-- Rutinas / plantillas de entreno
CREATE TABLE IF NOT EXISTS routines (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  -- JSON: [{ exercise_id, target_sets, target_reps, target_weight_kg, rest_sec, notes }]
  blocks          TEXT NOT NULL DEFAULT '[]',
  -- días de la semana sugeridos: 1=lu, 7=do
  suggested_days  TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

-- Etiquetas rápidas de estado por serie
CREATE TABLE IF NOT EXISTS set_state_tags (
  id              TEXT PRIMARY KEY,
  set_id          TEXT NOT NULL,
  -- 'clean' | 'limit' | 'soreness' | 'low_energy'
  tag             TEXT NOT NULL,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_set_tags_set ON set_state_tags(set_id);

-- Grabaciones de series (video path + biomecánica)
CREATE TABLE IF NOT EXISTS set_recordings (
  id              TEXT PRIMARY KEY,
  set_id          TEXT,
  workout_id      TEXT,
  video_path      TEXT NOT NULL,
  duration_sec    INTEGER,
  fps             INTEGER,
  -- JSON: array de PoseFrame comprimido (cada N frames)
  pose_frames     TEXT,
  -- JSON: lista de rep_markers [{ repIndex, timestampMs, faults: [...] }]
  rep_markers     TEXT,
  is_best         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  synced_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_set_recordings_exercise ON set_recordings(workout_id);

-- Catálogo de alimentos precargados + custom (calculable por gramo)
CREATE TABLE IF NOT EXISTS foods (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  brand           TEXT,
  barcode         TEXT,
  -- Por 100 g o por porción
  serving_unit    TEXT NOT NULL DEFAULT 'g',     -- 'g' | 'ml' | 'unidad'
  serving_size    REAL NOT NULL DEFAULT 100,
  kcal            REAL NOT NULL,
  protein_g       REAL NOT NULL DEFAULT 0,
  carbs_g         REAL NOT NULL DEFAULT 0,
  fat_g           REAL NOT NULL DEFAULT 0,
  fiber_g         REAL NOT NULL DEFAULT 0,
  is_supplement   INTEGER NOT NULL DEFAULT 0,
  -- 'precargado' | 'custom' | 'openfoodfacts'
  source          TEXT NOT NULL DEFAULT 'precargado',
  is_combo        INTEGER NOT NULL DEFAULT 0,
  -- JSON: [{ food_id, grams }] si es combo
  combo_items     TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);
CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);

-- Suplementos y registro de toma
CREATE TABLE IF NOT EXISTS supplement_logs (
  id              TEXT PRIMARY KEY,
  day             TEXT NOT NULL,
  food_id         TEXT,
  name            TEXT,
  dose            REAL,
  unit            TEXT,
  taken_at        INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  synced_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_supplement_day ON supplement_logs(day);

-- Periodización: ciclos de X semanas
CREATE TABLE IF NOT EXISTS periodization_cycles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  -- 'deficit' | 'recomp' | 'volume' | 'maintenance' | 'cut'
  goal            TEXT NOT NULL,
  start_date      TEXT NOT NULL,         -- ISO
  weeks           INTEGER NOT NULL,
  -- metas semanales
  target_weight_kg      REAL,
  target_weekly_kcal    REAL,             -- déficit/superávit semanal
  target_steps_per_day  INTEGER,
  target_protein_g_kg   REAL,
  target_volume_kg_week REAL,
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

-- Plan semanal de comidas (1 plantilla por día de la semana)
CREATE TABLE IF NOT EXISTS weekly_meal_plan (
  id              TEXT PRIMARY KEY,
  -- 1=lu ... 7=do
  day_of_week     INTEGER NOT NULL,
  meal_name       TEXT,                  -- 'desayuno' | 'almuerzo' | 'cena' | 'snack'
  food_id         TEXT,
  grams           REAL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER,
  UNIQUE(day_of_week, meal_name, food_id)
);

-- Lista de compras generada desde el plan semanal
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  grams           REAL,
  unit            TEXT,
  -- 'pending' | 'purchased'
  status          TEXT NOT NULL DEFAULT 'pending',
  added_at        INTEGER NOT NULL,
  purchased_at    INTEGER
);

-- Recordatorios locales (notificaciones programadas)
CREATE TABLE IF NOT EXISTS local_reminders (
  id              TEXT PRIMARY KEY,
  -- 'workout' | 'water' | 'supplement' | 'goals_review'
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  hour            INTEGER NOT NULL,        -- 0..23
  minute          INTEGER NOT NULL,        -- 0..59
  -- días de la semana: array JSON [1..7]
  days            TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);

-- Mapa de calor muscular precomputado (rolling 7d)
CREATE TABLE IF NOT EXISTS muscle_heatmap (
  id              TEXT PRIMARY KEY,
  muscle          TEXT NOT NULL,
  day             TEXT NOT NULL,
  volume_kg       REAL NOT NULL DEFAULT 0,
  sets_count      INTEGER NOT NULL DEFAULT 0,
  fatigue_score   REAL NOT NULL DEFAULT 0,    -- 0..1 (1 = muy fatigado)
  computed_at     INTEGER NOT NULL,
  UNIQUE(muscle, day)
);
CREATE INDEX IF NOT EXISTS idx_heatmap_muscle_day ON muscle_heatmap(muscle, day);

-- Eventos del calendario (sesiones completadas + métricas diarias agregadas)
CREATE TABLE IF NOT EXISTS calendar_days (
  day             TEXT PRIMARY KEY,
  workout_done    INTEGER NOT NULL DEFAULT 0,
  workout_id      TEXT,
  steps           INTEGER,
  kcal_in         REAL,
  kcal_out        REAL,
  water_ml        INTEGER,
  protein_g       REAL,
  sleep_hours     REAL,
  readiness_score INTEGER,
  -- estado de cumplimiento: 'full' | 'partial' | 'missed' | 'rest'
  compliance      TEXT,
  notes           TEXT
);

-- Calendario: planificación futura (qué sesión tocaría hacer)
CREATE TABLE IF NOT EXISTS planned_sessions (
  id              TEXT PRIMARY KEY,
  day             TEXT NOT NULL,            -- ISO date
  routine_id      TEXT,
  planned_exercises TEXT,                   -- JSON
  status          TEXT NOT NULL DEFAULT 'planned', -- 'planned' | 'done' | 'skipped' | 'moved'
  moved_to        TEXT,                     -- ISO date si se movió
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  synced_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_planned_day ON planned_sessions(day);

-- Triggers Fase 3
CREATE TRIGGER IF NOT EXISTS trg_routines_upsert
AFTER INSERT ON routines
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('routines', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_foods_upsert
AFTER INSERT ON foods
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('foods', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_set_recordings_upsert
AFTER INSERT ON set_recordings
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('set_recordings', NEW.id, 'upsert', NULL, NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_periodization_upsert
AFTER INSERT ON periodization_cycles
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('periodization_cycles', NEW.id, 'upsert', NULL, NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_supplement_logs_upsert
AFTER INSERT ON supplement_logs
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, payload, queued_at, next_retry_at)
  VALUES ('supplement_logs', NEW.id, 'upsert', NULL, NEW.created_at, NEW.created_at);
END;
`;
