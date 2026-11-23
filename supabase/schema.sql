-- ============================================================================
-- All-in-One Fitness · Backend Supabase (PostgreSQL) — Fases 1+2+3
-- ----------------------------------------------------------------------------
-- Setup: ejecutar este script en el SQL Editor de Supabase, o:
--   supabase db push   (con la CLI configurada)
--
-- Modelo:
--   - Sin Auth (Fase 2/3). Cada dispositivo se identifica por `device_id`.
--   - device_id se genera 1 vez en el móvil (expo-application + SecureStore)
--     y se manda en cada upsert. RLS filtra por device_id.
--   - Las tablas espejan el SQLite local (schema.sql + schema_phase3.sql).
--   - upload-only: el móvil nunca descarga cambios del cloud en Fase 2/3.
--   - 24 tablas totales + 2 funciones RPC + triggers updated_at.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identidad de dispositivos (registro ligero)
-- ---------------------------------------------------------------------------
create table if not exists devices (
  device_id         text primary key,
  app_version       text,
  os_version        text,
  model             text,
  last_seen_at      timestamptz default now(),
  created_at        timestamptz default now()
);

alter table devices enable row level security;
drop policy if exists "devices_upsert_own" on devices;
create policy "devices_upsert_own" on devices
  for insert with check (true);
drop policy if exists "devices_update_own" on devices;
create policy "devices_update_own" on devices
  for update using (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Catálogo de ejercicios
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id                text primary key,
  name              text not null,
  category          text not null,
  primary_muscle    text,
  secondary_muscles text,
  pose_config       jsonb,
  is_custom         boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

alter table exercises enable row level security;
drop policy if exists "exercises_read_all" on exercises;
create policy "exercises_read_all" on exercises for select using (true);
drop policy if exists "exercises_upsert_own" on exercises;
create policy "exercises_upsert_own" on exercises
  for insert with check (true);
drop policy if exists "exercises_update_own" on exercises;
create policy "exercises_update_own" on exercises
  for update using (true);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  name              text not null,
  notes             text,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_sec      int,
  total_volume_kg   double precision,
  status            text default 'in_progress',
  exercise_order    jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_workouts_device_started on workouts(device_id, started_at desc);

alter table workouts enable row level security;
drop policy if exists "workouts_owner_rw" on workouts;
create policy "workouts_owner_rw" on workouts
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Sets
-- ---------------------------------------------------------------------------
create table if not exists sets (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  workout_id        text not null references workouts(id) on delete cascade,
  exercise_id       text not null references exercises(id),
  set_index         int not null,
  weight_kg         double precision default 0,
  reps              int default 0,
  partial_reps      int default 0,
  rpe               double precision,
  tempo_sec         jsonb,
  rest_sec          int,
  est_1rm_kg        double precision,
  volume_kg         double precision,
  pose_summary      jsonb,
  video_path        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_sets_workout on sets(workout_id, set_index);
create index if not exists idx_sets_exercise_created on sets(exercise_id, created_at desc);

alter table sets enable row level security;
drop policy if exists "sets_owner_rw" on sets;
create policy "sets_owner_rw" on sets
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Rep events (eventos crudos por repetición)
-- ---------------------------------------------------------------------------
create table if not exists rep_events (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  set_id            text not null references sets(id) on delete cascade,
  rep_index         int not null,
  eccentric_ms      int,
  pause_ms          int,
  concentric_ms     int,
  rom_degrees       double precision,
  full_rom          boolean default true,
  biomechanics      jsonb,
  timestamp_ms      bigint not null,
  created_at        timestamptz default now()
);

create index if not exists idx_rep_events_set on rep_events(set_id, rep_index);

alter table rep_events enable row level security;
drop policy if exists "rep_events_owner_rw" on rep_events;
create policy "rep_events_owner_rw" on rep_events
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Body metrics (incluye composición completa de la Xiaomi S400 Scale)
-- ---------------------------------------------------------------------------
create table if not exists body_metrics (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  weight_kg         double precision,
  body_fat_pct      double precision,
  muscle_mass_kg    double precision,
  bone_mass_kg      double precision,
  water_mass_kg     double precision,
  chest_cm          double precision,
  waist_cm          double precision,
  hip_cm            double precision,
  arm_cm            double precision,
  thigh_cm          double precision,
  notes             text,
  source            text default 'manual',
  measured_at       timestamptz not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_body_metrics_device_measured on body_metrics(device_id, measured_at desc);

alter table body_metrics enable row level security;
drop policy if exists "body_metrics_owner_rw" on body_metrics;
create policy "body_metrics_owner_rw" on body_metrics
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Nutrition logs
-- ---------------------------------------------------------------------------
create table if not exists nutrition_logs (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day               text not null,
  meal_name         text,
  kcal              double precision default 0,
  protein_g         double precision,
  carbs_g           double precision,
  fat_g             double precision,
  fiber_g           double precision,
  is_supplement     boolean default false,
  logged_at         timestamptz not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_nutrition_device_day on nutrition_logs(device_id, day);

alter table nutrition_logs enable row level security;
drop policy if exists "nutrition_logs_owner_rw" on nutrition_logs;
create policy "nutrition_logs_owner_rw" on nutrition_logs
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Hydration logs
-- ---------------------------------------------------------------------------
create table if not exists hydration_logs (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day               text not null,
  ml                int not null,
  logged_at         timestamptz not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_hydration_device_day on hydration_logs(device_id, day);

alter table hydration_logs enable row level security;
drop policy if exists "hydration_logs_owner_rw" on hydration_logs;
create policy "hydration_logs_owner_rw" on hydration_logs
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Health Connect cache (importado desde Mi Fitness y otros sources)
-- ---------------------------------------------------------------------------
create table if not exists health_connect_cache (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  metric_type       text not null,
  day               text,
  started_at        timestamptz,
  ended_at          timestamptz,
  value             double precision,
  unit              text,
  source_app        text,
  raw_meta          jsonb,
  ingested_at       timestamptz default now(),
  unique(metric_type, day, started_at, source_app)
);

create index if not exists idx_hc_device_metric_day on health_connect_cache(device_id, metric_type, day);

alter table health_connect_cache enable row level security;
drop policy if exists "hc_owner_rw" on health_connect_cache;
create policy "hc_owner_rw" on health_connect_cache
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Personal records
-- ---------------------------------------------------------------------------
create table if not exists personal_records (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  exercise_id       text not null references exercises(id) on delete cascade,
  record_type       text not null,
  value             double precision not null,
  achieved_at       timestamptz not null,
  set_id            text,
  created_at        timestamptz default now()
);

create index if not exists idx_pr_device_exercise on personal_records(device_id, exercise_id, record_type);

alter table personal_records enable row level security;
drop policy if exists "pr_owner_rw" on personal_records;
create policy "pr_owner_rw" on personal_records
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Readiness / Inteligencia Cruzada (precomputados por el worker)
-- ---------------------------------------------------------------------------
create table if not exists daily_intelligence (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day               text not null,
  -- Readiness
  readiness_score   int,             -- 0..100
  readiness_factors jsonb,           -- { sleep, restingHr, muscleFatigue }
  -- Energy Balance
  kcal_in           double precision,
  kcal_out_active   double precision,
  kcal_out_basal    double precision,
  kcal_balance      double precision,
  -- Weight trend
  weight_kg         double precision,
  weight_trend_kg   double precision, -- suavizado (rolling 7d, sin retención líquidos)
  weight_delta_kg   double precision, -- diferencia vs ayer
  -- Stress / HR
  resting_hr        int,
  avg_hr_workout    int,
  stress_index      int,              -- 0..100 (estimado)
  computed_at       timestamptz default now(),
  unique(device_id, day)
);

alter table daily_intelligence enable row level security;
drop policy if exists "di_owner_rw" on daily_intelligence;
create policy "di_owner_rw" on daily_intelligence
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Sync log (qué subió y cuándo)
-- ---------------------------------------------------------------------------
create table if not exists sync_log (
  id                bigserial primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  table_name        text not null,
  records_pushed    int not null,
  status            text not null,      -- 'ok' | 'error'
  error_message     text,
  pushed_at         timestamptz default now()
);

alter table sync_log enable row level security;
drop policy if exists "sync_log_owner_rw" on sync_log;
create policy "sync_log_owner_rw" on sync_log
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ============================================================================
-- FASE 3 — Tablas adicionales
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rutinas / plantillas de entreno
-- ---------------------------------------------------------------------------
create table if not exists routines (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  name              text not null,
  description       text,
  blocks            jsonb not null default '[]'::jsonb,
  suggested_days    text,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

alter table routines enable row level security;
drop policy if exists "routines_owner_rw" on routines;
create policy "routines_owner_rw" on routines
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Etiquetas rápidas de estado por serie
-- ---------------------------------------------------------------------------
create table if not exists set_state_tags (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  set_id            text not null,
  tag               text not null,        -- 'clean' | 'limit' | 'soreness' | 'low_energy'
  note              text,
  created_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_set_tags_set on set_state_tags(set_id);

alter table set_state_tags enable row level security;
drop policy if exists "set_tags_owner_rw" on set_state_tags;
create policy "set_tags_owner_rw" on set_state_tags
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Grabaciones de series (video path + biomecánica comprimida)
-- ---------------------------------------------------------------------------
create table if not exists set_recordings (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  set_id            text,
  workout_id        text,
  video_path        text not null,
  duration_sec      int,
  fps               int,
  pose_frames       jsonb,
  rep_markers       jsonb,
  is_best           boolean default false,
  created_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_set_recordings_workout on set_recordings(workout_id);

alter table set_recordings enable row level security;
drop policy if exists "set_recordings_owner_rw" on set_recordings;
create policy "set_recordings_owner_rw" on set_recordings
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Catálogo de alimentos precargados + custom + barcode cache + combos
-- ---------------------------------------------------------------------------
create table if not exists foods (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  name              text not null,
  brand             text,
  barcode           text,
  serving_unit      text not null default 'g',
  serving_size      double precision not null default 100,
  kcal              double precision not null,
  protein_g         double precision not null default 0,
  carbs_g           double precision not null default 0,
  fat_g             double precision not null default 0,
  fiber_g           double precision not null default 0,
  is_supplement     boolean default false,
  source            text not null default 'precargado',
  is_combo          boolean default false,
  combo_items       jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_foods_barcode on foods(barcode);
create index if not exists idx_foods_name on foods(name);

alter table foods enable row level security;
drop policy if exists "foods_owner_rw" on foods;
create policy "foods_owner_rw" on foods
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Suplementos y registro de toma
-- ---------------------------------------------------------------------------
create table if not exists supplement_logs (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day               text not null,
  food_id           text,
  name              text,
  dose              double precision,
  unit              text,
  taken_at          timestamptz not null,
  created_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_supplement_device_day on supplement_logs(device_id, day);

alter table supplement_logs enable row level security;
drop policy if exists "supplement_logs_owner_rw" on supplement_logs;
create policy "supplement_logs_owner_rw" on supplement_logs
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Periodización: ciclos de X semanas
-- ---------------------------------------------------------------------------
create table if not exists periodization_cycles (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  name              text not null,
  goal              text not null,        -- 'deficit' | 'recomp' | 'volume' | 'maintenance' | 'cut'
  start_date        text not null,
  weeks             int not null,
  target_weight_kg        double precision,
  target_weekly_kcal      double precision,
  target_steps_per_day    int,
  target_protein_g_kg     double precision,
  target_volume_kg_week   double precision,
  notes             text,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

alter table periodization_cycles enable row level security;
drop policy if exists "periodization_owner_rw" on periodization_cycles;
create policy "periodization_owner_rw" on periodization_cycles
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Plan semanal de comidas (1 plantilla por día de la semana)
-- ---------------------------------------------------------------------------
create table if not exists weekly_meal_plan (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day_of_week       int not null,           -- 1=lu ... 7=do
  meal_name         text,
  food_id           text,
  grams             double precision,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now(),
  unique(device_id, day_of_week, meal_name, food_id)
);

alter table weekly_meal_plan enable row level security;
drop policy if exists "meal_plan_owner_rw" on weekly_meal_plan;
create policy "meal_plan_owner_rw" on weekly_meal_plan
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Lista de compras generada desde el plan semanal
-- ---------------------------------------------------------------------------
create table if not exists shopping_list_items (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  name              text not null,
  grams             double precision,
  unit              text,
  status            text not null default 'pending',
  added_at          timestamptz default now(),
  purchased_at      timestamptz,
  synced_at         timestamptz default now()
);

alter table shopping_list_items enable row level security;
drop policy if exists "shopping_owner_rw" on shopping_list_items;
create policy "shopping_owner_rw" on shopping_list_items
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Recordatorios locales (configuración persistida en cloud)
-- ---------------------------------------------------------------------------
create table if not exists local_reminders (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  type              text not null,           -- 'workout' | 'water' | 'supplement' | 'goals_review'
  title             text not null,
  body              text,
  hour              int not null,
  minute            int not null,
  days              text not null default '[1,2,3,4,5,6,7]',
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

alter table local_reminders enable row level security;
drop policy if exists "reminders_owner_rw" on local_reminders;
create policy "reminders_owner_rw" on local_reminders
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Mapa de calor muscular precomputado (rolling 7d)
-- ---------------------------------------------------------------------------
create table if not exists muscle_heatmap (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  muscle            text not null,
  day               text not null,
  volume_kg         double precision not null default 0,
  sets_count        int not null default 0,
  fatigue_score     double precision not null default 0,
  computed_at       timestamptz default now(),
  unique(device_id, muscle, day)
);

create index if not exists idx_heatmap_device_muscle_day on muscle_heatmap(device_id, muscle, day);

alter table muscle_heatmap enable row level security;
drop policy if exists "heatmap_owner_rw" on muscle_heatmap;
create policy "heatmap_owner_rw" on muscle_heatmap
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Calendario: métricas diarias agregadas
-- ---------------------------------------------------------------------------
create table if not exists calendar_days (
  day               text,
  device_id         text not null references devices(device_id) on delete cascade,
  workout_done      boolean default false,
  workout_id        text,
  steps             int,
  kcal_in           double precision,
  kcal_out          double precision,
  water_ml          int,
  protein_g         double precision,
  sleep_hours       double precision,
  readiness_score   int,
  compliance        text,                -- 'full' | 'partial' | 'missed' | 'rest'
  notes             text,
  primary key (device_id, day)
);

alter table calendar_days enable row level security;
drop policy if exists "calendar_days_owner_rw" on calendar_days;
create policy "calendar_days_owner_rw" on calendar_days
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ---------------------------------------------------------------------------
-- Calendario: planificación futura (qué sesión tocaría hacer)
-- ---------------------------------------------------------------------------
create table if not exists planned_sessions (
  id                text primary key,
  device_id         text not null references devices(device_id) on delete cascade,
  day               text not null,
  routine_id        text,
  planned_exercises jsonb,
  status            text not null default 'planned', -- 'planned' | 'done' | 'skipped' | 'moved'
  moved_to          text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz default now()
);

create index if not exists idx_planned_device_day on planned_sessions(device_id, day);

alter table planned_sessions enable row level security;
drop policy if exists "planned_sessions_owner_rw" on planned_sessions;
create policy "planned_sessions_owner_rw" on planned_sessions
  for all
  using (device_id = current_setting('app.current_device_id', true))
  with check (device_id = current_setting('app.current_device_id', true));

-- ============================================================================
-- Triggers y funciones
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Trigger: mantener updated_at automático
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'workouts','sets','body_metrics','nutrition_logs','hydration_logs',
    'routines','foods','periodization_cycles','weekly_meal_plan',
    'local_reminders','planned_sessions'
  ])
  loop
    execute format('drop trigger if exists trg_%I_touch on %I;', t, t);
    execute format('create trigger trg_%I_touch before update on %I for each row execute function touch_updated_at();', t, t);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- Función RPC: registrar dispositivo + setear contexto RLS en una sola call
-- El móvil la invoca al arrancar para "loguearse" sin auth.
-- ---------------------------------------------------------------------------
create or replace function register_device(
  p_device_id   text,
  p_app_version text,
  p_os_version  text,
  p_model       text
)
returns void
language plpgsql
security definer
as $$
begin
  insert into devices (device_id, app_version, os_version, model, last_seen_at)
  values (p_device_id, p_app_version, p_os_version, p_model, now())
  on conflict (device_id) do update
    set last_seen_at = now(),
        app_version  = excluded.app_version,
        os_version   = excluded.os_version,
        model        = excluded.model;
end;
$$;

-- El cliente Supabase invoca set_device_context(deviceId) antes del primer upsert
-- para poblar el GUC 'app.current_device_id' y que las RLS policies filtre por device.
create or replace function set_device_context(p_device_id text)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('app.current_device_id', p_device_id, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants al rol anon (usa la anon key del .env)
-- ---------------------------------------------------------------------------
grant execute on function set_device_context(text) to anon;
grant execute on function register_device(text, text, text, text) to anon;
grant execute on function touch_updated_at() to anon;

grant usage, select on sequence sync_log_id_seq to anon;

grant select, insert, update, delete on
  devices, exercises, workouts, sets, rep_events, body_metrics,
  nutrition_logs, hydration_logs, health_connect_cache, personal_records,
  daily_intelligence, sync_log,
  routines, set_state_tags, set_recordings, foods, supplement_logs,
  periodization_cycles, weekly_meal_plan, shopping_list_items,
  local_reminders, muscle_heatmap, calendar_days, planned_sessions
to anon;

-- ============================================================================
-- Verificación (opcional: ejecutar tras crear para confirmar)
-- ============================================================================
-- select count(*) as table_count from information_schema.tables
-- where table_schema = 'public' and table_type = 'BASE TABLE';
-- Debe devolver 24 tablas (12 Fase 1+2 + 12 Fase 3).
