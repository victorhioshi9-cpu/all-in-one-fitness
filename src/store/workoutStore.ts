/**
 * workoutStore.ts - Estado global del entrenamiento en curso.
 * - Sesion activa (workout_id, started_at).
 * - Series registradas en memoria (escritura inmediata sin red).
 * - Persistencia real en SQLite vía setRepo (Fase 1: stub funcional).
 */
import { create } from "zustand";

export interface SetDraft {
  id: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  partialReps: number;
  rpe?: number;
  tempoSec?: { eccentric: number; concentric: number };
  poseSummary?: any;
}

export interface WorkoutState {
  workoutId: string | null;
  startedAt: number | null;
  sets: SetDraft[];
  addSet: (s: Omit<SetDraft, "id">) => Promise<void>;
  newWorkout: () => void;
  endWorkout: () => void;
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workoutId: null,
  startedAt: null,
  sets: [],

  newWorkout: () =>
    set({
      workoutId: uid(),
      startedAt: Date.now(),
      sets: []
    }),

  endWorkout: () =>
    set({
      workoutId: null,
      startedAt: null,
      sets: []
    }),

  addSet: async (s) => {
    const draft: SetDraft = { ...s, id: uid() };
    set((st) => ({ sets: [...st.sets, draft] }));
    // La persistencia real en SQLite se invoca desde setRepo.persistSet(draft).
    // Fase 2: encolar en sync_queue para el backend.
  }
}));
