/**
 * routineLibrary.ts (Rediseño v0.4) - NEW
 * ----------------------------------------------------------------------------
 * Catálogo de rutinas pre-diseñadas, una por día de la semana + extras.
 *
 * Cada rutina referencia ejercicios por ID (de exercisePresets.ts) para que
 * el Coach AI pueda abrirlos directamente. Incluye:
 *   - Día de la semana sugerido (Lun..Dom | any)
 *   - Foco, emoji, dificultad
 *   - Bloques: exerciseId, name, emoji, sets, reps, restSec, notes
 *
 * Las rutinas son solo metadata: la persistencia real de workouts/sets sigue
 * siendo responsabilidad del workoutStore + setRepo. Aquí solo proveemos
 * datos para que la UI las muestre y el usuario las pueda seguir.
 */
import { EXERCISE_PRESETS } from "@/modules/biomechanics/exercisePresets";

export type DayOfWeek = "Lun" | "Mar" | "Mié" | "Jue" | "Vie" | "Sáb" | "Dom" | "any";
export type Difficulty = "principiante" | "intermedio" | "avanzado";

export interface RoutineBlock {
  exerciseId: string;
  name: string;
  emoji: string;
  sets: number;
  reps: string;            // "8-12" | "30s" | "10 (por lado)"
  restSec: number;
  notes?: string;
}

export interface Routine {
  id: string;
  name: string;
  dayOfWeek: DayOfWeek;
  focus: string;
  emoji: string;
  difficulty: Difficulty;
  blocks: RoutineBlock[];
}

/**
 * Helper: crea un bloque a partir del ID del ejercicio (resuelve nombre/emoji
 * desde los presets). Si el ID no existe, lanza (mejor fail-fast que silencioso).
 */
function block(
  exerciseId: string,
  sets: number,
  reps: string,
  restSec: number,
  notes?: string
): RoutineBlock {
  const preset = EXERCISE_PRESETS[exerciseId];
  if (!preset) {
    throw new Error(`routineLibrary: ejercicio desconocido "${exerciseId}"`);
  }
  return {
    exerciseId,
    name: preset.name,
    emoji: preset.emoji,
    sets,
    reps,
    restSec,
    notes
  };
}

// ============================================================================
// Rutinas (split Push/Pull/Legs + Cardio/Core + Full body principiante +
// Upper + HIIT + Movilidad/Recuperación)
// ============================================================================

const PUSH_DAY: Routine = {
  id: "routine_push_day",
  name: "Push Day",
  dayOfWeek: "Lun",
  focus: "Pecho · Hombros · Tríceps",
  emoji: "📦",
  difficulty: "intermedio",
  blocks: [
    block("bench_press", 4, "6-8", 120, "Calienta con barra vacía 2x15."),
    block("shoulder_press", 4, "8-10", 90, "Hombros a la altura de las orejas arriba."),
    block("push_up", 3, "12-15", 60, "Si es muy fácil, suma pausa abajo."),
    block("lateral_raise", 3, "12-15", 60, "Sube solo hasta la altura del hombro."),
    block("tricep_dips", 3, "10-12", 60, "Codos pegados al cuerpo.")
  ]
};

const PULL_DAY: Routine = {
  id: "routine_pull_day",
  name: "Pull Day",
  dayOfWeek: "Mar",
  focus: "Espalda · Bíceps",
  emoji: "🎣",
  difficulty: "intermedio",
  blocks: [
    block("deadlift", 4, "5-6", 180, "Calienta progresivo. Espalda recta siempre."),
    block("pull_up", 4, "6-10", 120, "Si no logras 6, usa banda elástica."),
    block("row", 4, "8-10", 90, "Tira del codo hacia atrás, no del hombro."),
    block("bicep_curl", 3, "10-12", 60, "Codos pegados al cuerpo, sin balanceo."),
    block("russian_twist", 3, "20 (por lado)", 45, "Mantén torso inclinado 45°.")
  ]
};

const LEG_DAY: Routine = {
  id: "routine_leg_day",
  name: "Leg Day",
  dayOfWeek: "Mié",
  focus: "Piernas completas",
  emoji: "🦵",
  difficulty: "intermedio",
  blocks: [
    block("squat", 4, "6-8", 150, "Profundidad paralela, rodillas alineadas."),
    block("leg_press", 3, "10-12", 90, "No trabes rodillas arriba."),
    block("lunge", 3, "10 (por lado)", 60, "Rodilla delantera no pasa la punta del pie."),
    block("hip_thrust", 3, "10-12", 90, "Aprieta glúteo arriba 1s."),
    block("calf_raise", 4, "15-20", 45, "Sube lento, pausa arriba.")
  ]
};

const CARDIO_CORE: Routine = {
  id: "routine_cardio_core",
  name: "Cardio + Core",
  dayOfWeek: "Jue",
  focus: "Resistencia · Core",
  emoji: "🔥",
  difficulty: "intermedio",
  blocks: [
    block("jumping_jack", 4, "45s", 30, "Mantén ritmo constante."),
    block("plank", 4, "45-60s", 45, "Cuerpo recto, sin hundir cadera."),
    block("russian_twist", 4, "20 (por lado)", 30, "Pies levantados si puedes."),
    block("burpee", 4, "10-12", 60, "Salta arriba con energía."),
    block("leg_extension", 3, "15-20", 45, "Controla la bajada.")
  ]
};

const FULL_BODY_BEGINNER: Routine = {
  id: "routine_full_body_beginner",
  name: "Full Body Principiante",
  dayOfWeek: "any",
  focus: "Cuerpo completo · Aprendizaje",
  emoji: "🌱",
  difficulty: "principiante",
  blocks: [
    block("squat", 3, "10-12", 90, "Foco en técnica, no en peso."),
    block("push_up", 3, "8-12", 60, "Rodillas en el suelo si hace falta."),
    block("row", 3, "10-12", 60, "Espalda recta."),
    block("lunge", 3, "8 (por lado)", 60, "Paso cómodo, equilibrio."),
    block("plank", 3, "30-45s", 45, "Respira, no aguantes el aire.")
  ]
};

const UPPER_BODY: Routine = {
  id: "routine_upper_body",
  name: "Upper Body",
  dayOfWeek: "Vie",
  focus: "Pecho · Espalda · Hombros · Brazos",
  emoji: "💪",
  difficulty: "avanzado",
  blocks: [
    block("bench_press", 4, "6-8", 120, "Hasta falla técnica en última serie."),
    block("pull_up", 4, "6-10", 120, "Rango completo: barbilla arriba."),
    block("shoulder_press", 3, "8-10", 90, "Core firme, no arquees la espalda."),
    block("row", 3, "8-10", 90, "Aprieta escapulas al final."),
    block("bicep_curl", 3, "10-12", 60, "Sin balanceo."),
    block("tricep_dips", 3, "10-12", 60, "Baja hasta 90° de codo.")
  ]
};

const HIIT_QUEMADORA: Routine = {
  id: "routine_hiit_quemadora",
  name: "HIIT Quemadora",
  dayOfWeek: "Sáb",
  focus: "Cardio · Quema grasa",
  emoji: "⚡",
  difficulty: "avanzado",
  blocks: [
    block("burpee", 5, "45s ON / 15s OFF", 0, "5 rondas. No pares hasta el pitido."),
    block("jumping_jack", 4, "60s", 20, "Mantén ritmo."),
    block("lunge", 4, "30s (por lado)", 20, "Rápido y explosivo."),
    block("push_up", 4, "30s", 20, "Máximas reps en 30s."),
    block("plank", 3, "60s", 30, "Cierra el circuito con core.")
  ]
};

const MOVILIDAD_RECUPERACION: Routine = {
  id: "routine_movilidad_recuperacion",
  name: "Movilidad + Recuperación",
  dayOfWeek: "Dom",
  focus: "Movilidad · Recuperación activa",
  emoji: "🧘",
  difficulty: "principiante",
  blocks: [
    block("plank", 3, "30s", 30, "Variación suave: rodillas en el suelo."),
    block("russian_twist", 3, "12 (por lado)", 30, "Movilidad torácica."),
    block("calf_raise", 3, "12-15", 30, "Movilidad de tobillo."),
    block("lunge", 3, "8 (por lado)", 30, "Estira cadera al final."),
    block("hip_thrust", 2, "10", 60, "Activa glúteos sin peso extra.")
  ]
};

// ============================================================================
// Catálogo exportado
// ============================================================================
export const ROUTINES: Routine[] = [
  PUSH_DAY,
  PULL_DAY,
  LEG_DAY,
  CARDIO_CORE,
  FULL_BODY_BEGINNER,
  UPPER_BODY,
  HIIT_QUEMADORA,
  MOVILIDAD_RECUPERACION
];

/** Mapa día -> rutina sugerida. Para "any" se omite del mapa (es genérica). */
export const ROUTINES_BY_DAY: Record<Exclude<DayOfWeek, "any">, Routine | undefined> = {
  "Lun": PUSH_DAY,
  "Mar": PULL_DAY,
  "Mié": LEG_DAY,
  "Jue": CARDIO_CORE,
  "Vie": UPPER_BODY,
  "Sáb": HIIT_QUEMADORA,
  "Dom": MOVILIDAD_RECUPERACION
};

export const DAYS_OF_WEEK: Exclude<DayOfWeek, "any">[] =
  ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Helper para estimar duración total de una rutina (sets × reps prom + rests). */
export function estimateRoutineMinutes(r: Routine): number {
  let totalSec = 0;
  for (const b of r.blocks) {
    const repsNum = parseInt(b.reps, 10);
    const avgReps = Number.isFinite(repsNum) ? Math.max(1, repsNum) : 12;
    const setSec = avgReps * 3;          // ~3s por rep
    totalSec += b.sets * (setSec + b.restSec);
  }
  // Warmup + transiciones
  totalSec += 180;
  return Math.max(10, Math.round(totalSec / 60));
}

/** Helper: serie máxima de sets (4x10 estilo resumen). */
export function summarizeSetsReps(r: Routine): string {
  const setOptions = new Set<string>();
  for (const b of r.blocks) setOptions.add(`${b.sets}×${b.reps}`);
  const arr = Array.from(setOptions);
  if (arr.length <= 2) return arr.join(" · ");
  return `${arr.length} configuraciones`;
}
