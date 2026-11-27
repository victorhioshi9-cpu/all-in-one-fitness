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
import { buildPlan } from "@/modules/plan/planEngine";

export type Gender = "male" | "female";
/**
 * lose        = perder grasa/peso (déficit)
 * maintain    = mantener
 * gain        = ganar peso (superávit más amplio)
 * hypertrophy = hipertrofia: ganar músculo con superávit pequeño (lean bulk)
 */
export type Goal = "lose" | "maintain" | "gain" | "hypertrophy";
export type Experience = "beginner" | "intermediate" | "advanced";
export type ActivityLevel =
  | "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface OnboardingData {
  heightCm: number | null;
  weightKg: number | null;
  ageYears: number | null;
  gender: Gender | null;
  goal: Goal | null;
  activityLevel: ActivityLevel | null;
  /** % de grasa introducido a mano (si la báscula no lo sincroniza). */
  bodyFatManualPct?: number | null;
  /** % de grasa leído de la báscula vía Health Connect (se actualiza solo). */
  bodyFatScalePct?: number | null;
  /** Experiencia de entrenamiento (define volumen y frecuencia del plan). */
  experience?: Experience | null;
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
  /** Guarda el % de grasa de la báscula (HC) y recalcula objetivos. */
  setScaleBodyFat: (pct: number | null) => void;
  setOnboardingCompleted: (done: boolean) => void;
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};


const GOAL_PROTEIN_FACTOR: Record<Goal, number> = {
  lose: 2.2,        // más proteína en déficit para conservar músculo
  maintain: 1.8,
  gain: 1.8,
  hypertrophy: 2.2
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

  // Con objetivo y actividad definidos, la fuente de verdad es el motor del plan
  // (así Nutrición, Perfil y "Mi plan" muestran SIEMPRE las mismas cifras).
  if (goal && activityLevel) {
    const plan = buildPlan({
      weightKg, heightCm, ageYears, gender, goal, activityLevel,
      experience: data.experience ?? "intermediate",
      bodyFatPct: data.bodyFatManualPct ?? data.bodyFatScalePct ?? null
    });
    return {
      bmrKcal: plan.calories.bmr,
      targetKcalDay: plan.calories.target,
      targetProteinG: plan.macros.proteinG
    };
  }

  // Sin objetivo/actividad: solo BMR (Mifflin-St Jeor) y TDEE si hay actividad.
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const bmr = gender === "male" ? base + 5 : base - 161;
  const tdee = activityLevel ? bmr * ACTIVITY_FACTOR[activityLevel] : bmr;
  return {
    bmrKcal: Math.round(bmr),
    targetKcalDay: Math.round(tdee),
    targetProteinG: goal ? Math.round(weightKg * GOAL_PROTEIN_FACTOR[goal]) : null
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
    bodyFatManualPct: state.bodyFatManualPct,
    bodyFatScalePct: state.bodyFatScalePct,
    experience: state.experience,
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
  bodyFatManualPct: null,
  bodyFatScalePct: null,
  experience: "intermediate",

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
          activityLevel: parsed.activityLevel ?? null,
          bodyFatManualPct: parsed.bodyFatManualPct ?? null,
          bodyFatScalePct: parsed.bodyFatScalePct ?? null,
          experience: parsed.experience ?? "intermediate"
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
      activityLevel: data.activityLevel ?? get().activityLevel,
      // null explícito = borrar; undefined = conservar el valor actual
      bodyFatManualPct: data.bodyFatManualPct !== undefined ? data.bodyFatManualPct : get().bodyFatManualPct,
      bodyFatScalePct: get().bodyFatScalePct,
      experience: data.experience !== undefined ? data.experience : get().experience
    };
    const targets = computeTargets(merged);
    set({ ...merged, ...targets });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  },

  setScaleBodyFat: (pct) => {
    const cur = get();
    if (cur.bodyFatScalePct === pct) return;
    const merged: OnboardingData = {
      heightCm: cur.heightCm, weightKg: cur.weightKg, ageYears: cur.ageYears,
      gender: cur.gender, goal: cur.goal, activityLevel: cur.activityLevel,
      bodyFatManualPct: cur.bodyFatManualPct, bodyFatScalePct: pct, experience: cur.experience
    };
    set({ bodyFatScalePct: pct, ...computeTargets(merged) });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  },

  setOnboardingCompleted: (done) => {
    set({ onboardingCompleted: done });
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(serialize(get())));
  }
}));
