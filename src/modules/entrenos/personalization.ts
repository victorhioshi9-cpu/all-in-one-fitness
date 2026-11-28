/**
 * personalization.ts (v0.5.1)
 * Adapta las rutinas fijas del catálogo al perfil de la persona:
 *   - Bajo impacto: sustituye burpees/saltos/rodillas altas… por alternativas sin salto.
 *   - Principiante: una serie menos en bloques largos y más descanso.
 *   - La dificultad mostrada refleja la adaptada (ya no "intermedio" para todos).
 */
import { useMemo } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { computeTrainingProfile, type TrainingProfile, type Level } from "@/modules/profile/trainingProfile";
import { EXERCISE_PRESETS } from "@/modules/biomechanics/exercisePresets";
import {
  ROUTINES, ROUTINES_BY_DAY, type Routine, type RoutineBlock, type DayOfWeek
} from "./routineLibrary";

const IMPACT = new Set([
  "burpee", "jumping_jack", "mountain_climber", "jump_rope", "high_knees",
  "box_jump", "burpee_pull_up", "treadmill_sprint"
]);

/** Impacto → alternativa SIN salto. */
const LOW_IMPACT_SWAP: Record<string, { id: string; reps?: string; note: string }> = {
  burpee:           { id: "cycling_intervals", reps: "30s ON / 30s OFF", note: "Ritmo fuerte pero sin impacto." },
  jumping_jack:     { id: "battle_rope",       reps: "30s",            note: "Cardio de brazos sin saltar." },
  mountain_climber: { id: "plank_shoulder_tap", reps: "20 toques",     note: "Core y hombros, sin impacto." },
  jump_rope:        { id: "cycling_intervals", reps: "30s ON / 30s OFF", note: "Bici en lugar de cuerda." },
  high_knees:       { id: "farmer_walk",       reps: "40 s",           note: "Caminata con carga ligera." },
  box_jump:         { id: "dumbbell_step_up",  reps: "10 (por lado)",  note: "Subir al cajón/escalón sin saltar." },
  burpee_pull_up:   { id: "lat_pulldown",      reps: "10-12",          note: "Tirón vertical controlado." },
  treadmill_sprint: { id: "cycling_intervals", reps: "30s ON / 30s OFF", note: "Intervalos en bici." }
};

const RANK: Record<Level, number> = { principiante: 0, intermedio: 1, avanzado: 2 };
const minLevel = (a: Level, b: Level): Level => (RANK[a] <= RANK[b] ? a : b);

function swapBlock(b: RoutineBlock): RoutineBlock {
  const sw = LOW_IMPACT_SWAP[b.exerciseId];
  const preset = sw && EXERCISE_PRESETS[sw.id];
  if (!sw || !preset) return b;
  return {
    ...b, exerciseId: preset.id, name: preset.name, emoji: preset.emoji,
    reps: sw.reps ?? b.reps, notes: sw.note
  };
}

export function adaptRoutine(r: Routine, p: TrainingProfile): Routine {
  let blocks = r.blocks;
  let name = r.name;
  let focus = r.focus;
  let emoji = r.emoji;

  const hasImpact = blocks.some((b) => IMPACT.has(b.exerciseId));
  if (p.lowImpact && hasImpact) {
    blocks = blocks.map((b) => (IMPACT.has(b.exerciseId) ? swapBlock(b) : b));
    if (r.id === "routine_hiit_quemadora") {
      name = "Cardio Quema-grasa (bajo impacto)";
      focus = "Cardio · Sin saltos";
      emoji = "🚴";
    } else {
      name = `${r.name} (bajo impacto)`;
    }
  }

  if (p.level === "principiante") {
    blocks = blocks.map((b) => ({
      ...b,
      sets: b.sets >= 4 ? b.sets - 1 : b.sets,
      restSec: b.restSec > 0 ? b.restSec + 15 : b.restSec
    }));
  }

  return {
    ...r, name, focus, emoji, blocks,
    difficulty: minLevel(r.difficulty, p.level)
  };
}

export function routineForDay(day: Exclude<DayOfWeek, "any">, p: TrainingProfile): Routine | undefined {
  const r = ROUTINES_BY_DAY[day];
  return r ? adaptRoutine(r, p) : undefined;
}

export function adaptedRoutines(p: TrainingProfile): Routine[] {
  return ROUTINES.map((r) => adaptRoutine(r, p));
}

/** Perfil de entrenamiento del usuario actual (se recalcula si cambia su perfil). */
export function useTrainingProfile(): TrainingProfile {
  const heightCm = useSettingsStore((s) => s.heightCm);
  const weightKg = useSettingsStore((s) => s.weightKg);
  const gender = useSettingsStore((s) => s.gender);
  const experience = useSettingsStore((s) => s.experience);
  const manual = useSettingsStore((s) => s.bodyFatManualPct);
  const scale = useSettingsStore((s) => s.bodyFatScalePct);
  return useMemo(
    () => computeTrainingProfile({
      heightCm, weightKg, gender, experience, bodyFatPct: manual ?? scale ?? null
    }),
    [heightCm, weightKg, gender, experience, manual, scale]
  );
}
