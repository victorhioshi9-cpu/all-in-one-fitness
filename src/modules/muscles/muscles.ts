/**
 * muscles.ts - Modelo estructurado de músculos.
 * ----------------------------------------------------------------------------
 * Antes cada ejercicio tenía solo `primaryMuscle: string` ("Glúteo + Cuádriceps").
 * Aquí lo convertimos en IDs tipados SIN tocar los ~80 presets existentes:
 *   - parseMuscleText(): interpreta el texto libre (también el guardado en la
 *     columna exercises.primary_muscle de SQLite).
 *   - getExerciseMuscles(): primarios + secundarios de un ejercicio.
 *
 * Los IDs coinciden con las zonas dibujadas en bodyPaths.ts.
 */
import type { BodyView } from "./bodyPaths";
import { BODY_ZONES } from "./bodyPaths";
import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";

export type MuscleId =
  | "chest" | "shoulders" | "traps" | "upper_back" | "lats" | "lower_back"
  | "biceps" | "triceps" | "forearms"
  | "abs" | "obliques"
  | "glutes" | "quads" | "hamstrings" | "adductors" | "calves";

export const MUSCLE_LABEL: Record<MuscleId, string> = {
  chest: "Pecho",
  shoulders: "Hombros",
  traps: "Trapecio",
  upper_back: "Espalda alta",
  lats: "Dorsales",
  lower_back: "Lumbar",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazos",
  abs: "Abdomen",
  obliques: "Oblicuos",
  glutes: "Glúteos",
  quads: "Cuádriceps",
  hamstrings: "Isquios",
  adductors: "Aductores",
  calves: "Gemelos"
};

export const ALL_MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleId[];

/** Vistas (frente/espalda) donde aparece cada músculo. */
export const MUSCLE_VIEWS: Record<MuscleId, BodyView[]> = ALL_MUSCLES.reduce((acc, id) => {
  const views: BodyView[] = [];
  if (BODY_ZONES.front[id]) views.push("front");
  if (BODY_ZONES.back[id]) views.push("back");
  acc[id] = views;
  return acc;
}, {} as Record<MuscleId, BodyView[]>);

// ---------------------------------------------------------------------------
// Parser de texto libre -> IDs
// ---------------------------------------------------------------------------
const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface ParsedMuscles { muscles: MuscleId[]; cardio: boolean }

const RULES: { test: RegExp; add: MuscleId[] }[] = [
  { test: /pecho|pectoral/, add: ["chest"] },
  { test: /hombro|deltoid/, add: ["shoulders"] },
  { test: /trapecio/, add: ["traps"] },
  { test: /dorsal/, add: ["lats"] },
  { test: /espalda/, add: ["lats", "upper_back"] },
  { test: /lumbar/, add: ["lower_back"] },
  { test: /bicep|braquial/, add: ["biceps"] },
  { test: /tricep/, add: ["triceps"] },
  { test: /antebrazo/, add: ["forearms"] },
  { test: /abdomen|abdominal/, add: ["abs"] },
  { test: /core/, add: ["abs", "obliques"] },
  { test: /oblicuo/, add: ["obliques"] },
  { test: /gluteo/, add: ["glutes"] },
  { test: /cuadricep/, add: ["quads"] },
  { test: /isquio|femoral/, add: ["hamstrings"] },
  { test: /aductor|adductor/, add: ["adductors"] },
  { test: /gemelo|pantorrilla/, add: ["calves"] },
  { test: /pierna/, add: ["quads", "glutes", "hamstrings"] }
];

export function parseMuscleText(text: string | null | undefined): ParsedMuscles {
  const t = strip(text ?? "");
  const set = new Set<MuscleId>();
  for (const r of RULES) if (r.test.test(t)) r.add.forEach((m) => set.add(m));
  const cardio = /cardio|full body/.test(t);
  return { muscles: Array.from(set), cardio };
}

// ---------------------------------------------------------------------------
// Músculos secundarios
// ---------------------------------------------------------------------------
/** Secundarios por defecto según el músculo principal. */
const DEFAULT_SECONDARY: Partial<Record<MuscleId, MuscleId[]>> = {
  chest: ["triceps", "shoulders"],
  shoulders: ["triceps", "traps"],
  lats: ["biceps", "forearms"],
  upper_back: ["biceps", "shoulders"],
  biceps: ["forearms"],
  triceps: ["shoulders"],
  forearms: ["biceps"],
  quads: ["glutes", "adductors"],
  glutes: ["hamstrings", "quads"],
  hamstrings: ["glutes", "lower_back"],
  abs: ["obliques"],
  obliques: ["abs"]
};

/** Ajustes por ejercicio (primarios y secundarios exactos). */
const OVERRIDES: Record<string, { primary?: MuscleId[]; secondary?: MuscleId[] }> = {
  squat: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "lower_back", "abs"] },
  front_squat: { secondary: ["glutes", "abs", "upper_back"] },
  deadlift: { primary: ["hamstrings", "glutes", "lower_back"], secondary: ["lats", "traps", "forearms", "quads"] },
  romanian_deadlift: { primary: ["hamstrings", "glutes"], secondary: ["lower_back", "forearms"] },
  bench_press: { primary: ["chest"], secondary: ["triceps", "shoulders"] },
  push_up: { primary: ["chest"], secondary: ["triceps", "shoulders", "abs"] },
  shoulder_press: { primary: ["shoulders"], secondary: ["triceps", "traps"] },
  pull_up: { primary: ["lats", "upper_back"], secondary: ["biceps", "forearms", "abs"] },
  row: { primary: ["lats", "upper_back"], secondary: ["biceps", "lower_back", "shoulders"] },
  plank: { primary: ["abs"], secondary: ["obliques", "shoulders", "lower_back", "glutes"] },
  lunge: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "calves"] },
  hip_thrust: { primary: ["glutes"], secondary: ["hamstrings", "adductors"] },
  tricep_dips: { primary: ["triceps"], secondary: ["chest", "shoulders"] },
  face_pull: { primary: ["shoulders", "upper_back"], secondary: ["traps", "biceps"] },
  lateral_raise: { primary: ["shoulders"], secondary: ["traps"] },
  calf_raise: { primary: ["calves"], secondary: [] },
  leg_extension: { primary: ["quads"], secondary: [] },
  leg_curl: { primary: ["hamstrings"], secondary: ["calves"] },
  leg_press: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors"] },
  russian_twist: { primary: ["obliques", "abs"], secondary: ["lower_back"] },
  bicep_curl: { primary: ["biceps"], secondary: ["forearms"] }
};

export interface ExerciseMuscles {
  primary: MuscleId[];
  secondary: MuscleId[];
  /** Ejercicios de cardio / cuerpo completo (sin zona concreta). */
  cardio: boolean;
}

const cache = new Map<string, ExerciseMuscles>();

export function getExerciseMuscles(exercise: ExercisePreset | string): ExerciseMuscles {
  const preset = typeof exercise === "string" ? EXERCISE_PRESETS[exercise] : exercise;
  if (!preset) return { primary: [], secondary: [], cardio: false };
  const hit = cache.get(preset.id);
  if (hit) return hit;

  const parsed = parseMuscleText(preset.primaryMuscle);
  const ov = OVERRIDES[preset.id];
  const primary = ov?.primary ?? parsed.muscles;
  let secondary = ov?.secondary;
  if (!secondary) {
    const s = new Set<MuscleId>();
    primary.forEach((p) => DEFAULT_SECONDARY[p]?.forEach((m) => s.add(m)));
    secondary = Array.from(s);
  }
  secondary = secondary.filter((m) => !primary.includes(m));

  const res: ExerciseMuscles = { primary, secondary, cardio: parsed.cardio && primary.length === 0 };
  cache.set(preset.id, res);
  return res;
}

/** Ejercicios cuyo músculo principal incluye `muscle`. */
export function exercisesForMuscle(muscle: MuscleId, includeSecondary = false): ExercisePreset[] {
  return Object.values(EXERCISE_PRESETS).filter((ex) => {
    const m = getExerciseMuscles(ex);
    return m.primary.includes(muscle) || (includeSecondary && m.secondary.includes(muscle));
  });
}

/** Elige la vista (frente/espalda) que muestra más de los músculos dados. */
export function viewForMuscles(ids: MuscleId[]): BodyView {
  let f = 0, b = 0;
  for (const id of ids) {
    const v = MUSCLE_VIEWS[id] ?? [];
    if (v.includes("front")) f++;
    if (v.includes("back")) b++;
  }
  return b > f ? "back" : "front";
}

// ---------------------------------------------------------------------------
// Metadatos de presentación
// ---------------------------------------------------------------------------
export const CATEGORY_LABEL: Record<ExercisePreset["category"], string> = {
  free_weight: "Pesas libres",
  machine: "Máquina",
  cable: "Polea",
  calisthenic: "Calistenia",
  cardio: "Cardio"
};

export type Level = "principiante" | "intermedio" | "avanzado";

const BEGINNER = new Set([
  "push_up", "plank", "jumping_jack", "calf_raise", "leg_extension", "leg_press", "leg_curl",
  "goblet_squat", "lat_pulldown", "chest_press_machine", "machine_shoulder_press",
  "seated_row_machine", "cable_row", "tricep_pushdown", "tricep_rope_pushdown", "dumbbell_curl",
  "high_knees", "jump_rope", "lateral_raise", "wide_push_up"
]);
const ADVANCED = new Set([
  "deadlift", "sumo_deadlift", "pull_up", "chin_up", "towel_pull_up", "l_sit", "burpee_pull_up",
  "box_jump", "bulgarian_split", "front_squat", "pike_push_up", "skull_crusher", "hanging_leg_raise"
]);

export function exerciseLevel(id: string): Level {
  if (BEGINNER.has(id)) return "principiante";
  if (ADVANCED.has(id)) return "avanzado";
  return "intermedio";
}
