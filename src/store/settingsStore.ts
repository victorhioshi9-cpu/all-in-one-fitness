/**
 * settingsStore.ts (Rediseño v0.4) - Preferencias del usuario + datos de
 * onboarding (perfil corporal) y objetivos calóricos calculados.
 *
 * Conserva todos los campos anteriores (keepScreenAwake, voiceCoach, etc.).
 * Añade:
 *   - onboardingCompleted: gate para mostrar OnboardingScreen vs RootNavigator
 *   - heightCm / weightKg / ageYears / gender / goal / activityLevel
 *   - bmrKcal / targetKcalDay / targetProteinG (calculados con Mifflin-St Jeor)
 *   - setOnboardingData(...) que recalcula BMR + objetivo al guardar.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Gender = "male" | "female";
export type Goal = "lose" | "maintain" | "gain";
export type ActivityLevel =
  | "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface OnboardingData {
  heightCm: number | null;
  weightKg: number | null;
  ageYears: number | null;
  gender: Gender | null;
  goal: Goal | null;
  activityLevel: ActivityLevel | null;
}

interface ComputedTargets {
  bmrKcal: number | null;
  targetKcalDay: number | null;
  targetProteinG: number | null;
}

interface SettingsState extends OnboardingData, ComputedTargets {
  // Preferencias (campos originales)
  keepScreenAwake: boolean;
  voiceCoach: boolean;
  audioTones: boolean;
  accidentalTouchGuard: boolean;
  exportFormat: "json" | "csv";

  // Onboarding
  onboardingCompleted: boolean;

  // Acciones
  loadFromStorage: () => Promise<void>;
  toggle: (key: "keepScreenAwake" | "voiceCoach" | "audioTones" | "accidentalTouchGuard") => void;
  setExport: (f: "json" | "csv") => void;
  setOnboardingData: (data: Partial<OnboardingData>) => void;
  setOnboardingCompleted: (done: boolean) => void;
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 400
};

const GOAL_PROTEIN_FACTOR: Record<Goal, number> = {
  lose: 2.0,
  maintain: 1.8,
  gain: 2.2
};

/**
 * Calcula BMR (Mifflin-St Jeor), objetivo calórico y objetivo de proteína.
 * Devuelve null en los campos que no se pueden calcular si faltan inputs.
 */
export function computeTargets(data: OnboardingData): ComputedTargets {
  const { weightKg, heightCm, ageYears, gender, goal, activityLevel } = data;

  if (!weightKg || !heightCm || !ageYears || !gender) {
    return { bmrKcal: null, targetKcalDay: null, targetProteinG: null };
  }

  // BMR Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const bmr = gender === "male" ? base + 5 : base - 161;

  // TDEE = BMR * factor actividad
  const tdee = activityLevel ? bmr * ACTIVITY_FACTOR[activityLevel] : bmr;

  // Ajuste por objetivo
  const targetKcal = goal ? Math.round(tdee + GOAL_KCAL_DELTA[goal]) : Math.round(tdee);

  // Proteína por kg de peso y objetivo
  const targetProtein = goal ? Math.round(weightKg * GOAL_PROTEIN_FACTOR[goal]) : null;

  return {
    bmrKcal: Math.round(bmr),
    targetKcalDay: targetKcal,
    targetProteinG: targetProtein
  };
}

const PERSIST_KEY = "aio_settings";

/** Serializa solo los campos persistibles. */
function serialize(state: SettingsState): Record<string, unknown> {
  return {
    // Preferencias
    keepScreenAwake: state.keepScreenAwake,
    voiceCoach: state.voiceCoach,
    audioTones: state.audioTones,
    accidentalTouchGuard: state.accidentalTouchGuard,
    exportFormat: state.exportFormat,
    // Onboarding
    onboardingCompleted: state.onboardingCompleted,
    heightCm: state.heightCm,
    weightKg: state.weightKg,
    ageYears: state.ageYears,
    gender: state.gender,
    goal: state.goal,
    activityLevel: state.activityLevel,
    // Computados (caché)
    bmrKcal: state.bmrKcal,
    targetKcalDay: state.targetKcalDay,
    targetProteinG: state.targetProteinG
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Preferencias por defecto
  keepScreenAwake: true,
  voiceCoach: true,
  audioTones: true,
  accidentalTouchGuard: true,
  exportFormat: "json",

  // Onboarding por defecto (no completado hasta que el usuario llene el wizard)
  onboardingCompleted: false,
  heightCm: null,
  weightKg: null,
  ageYears: null,
  gender: null,
  goal: null,
  activityLevel: null,

  // Computados
  bmrKcal: null,
  targetKcalDay: null,
  targetProteinG: null,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(PERSIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Re-calcular targets por si acaso las fórmulas cambiaron.
        const merged: OnboardingData = {
          heightCm: parsed.heightCm ?? null,
          weightKg: parsed.weightKg ?? null,
          ageYears: parsed.ageYears ?? null,
          gender: parsed.gender ?? null,
          goal: parsed.goal ?? null,
          activityLevel: parsed.activityLevel ?? null
        };
        const targets = computeTargets(merged);
        set({ ...parsed, ...targets });
      }
    } catch (err) {
      console.warn("[settingsStore] loadFromStorage falló:", err);
    }
  },

  toggle: (key) => {
    const next = !get()[key];
    set({ [key]: next } as Partial<SettingsState>);
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  },

  setExport: (f) => {
    set({ exportFormat: f });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  },

  setOnboardingData: (data) => {
    const merged: OnboardingData = {
      heightCm: data.heightCm ?? get().heightCm,
      weightKg: data.weightKg ?? get().weightKg,
      ageYears: data.ageYears ?? get().ageYears,
      gender: data.gender ?? get().gender,
      goal: data.goal ?? get().goal,
      activityLevel: data.activityLevel ?? get().activityLevel
    };
    const targets = computeTargets(merged);
    set({ ...merged, ...targets });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  },

  setOnboardingCompleted: (done) => {
    set({ onboardingCompleted: done });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  }
}));
