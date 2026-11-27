/**
 * planEngine.ts
 * ----------------------------------------------------------------------------
 * Genera un plan personalizado (calorías, macros, entrenamiento, pasos, sueño)
 * a partir del perfil del usuario y, si existe, del % de grasa de la báscula.
 *
 * Objetivos soportados:
 *   - lose        → perder grasa/peso (déficit moderado, proteína alta, pesas para
 *                   conservar músculo + pasos/cardio suave)
 *   - maintain    → mantener
 *   - gain        → ganar peso (superávit más amplio, entrenamiento general)
 *   - hypertrophy → hipertrofia: superávit pequeño (o recomposición si hay mucha
 *                   grasa), volumen alto y proteína 2.2 g/kg
 *
 * Son guías generales basadas en recomendaciones habituales de nutrición
 * deportiva; no sustituyen a un médico ni a un nutricionista/entrenador.
 */
import type { ActivityLevel, Experience, Gender, Goal } from "@/store/settingsStore";

export interface PlanInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  gender: Gender;
  goal: Goal;
  activityLevel: ActivityLevel;
  experience: Experience;
  /** % de grasa (báscula o manual). */
  bodyFatPct?: number | null;
}

export interface PlanExercise { name: string; sets: number; reps: string; presetId?: string }
export interface PlanDay { title: string; focus: string; exercises: PlanExercise[] }

export interface PersonalPlan {
  goal: Goal;
  goalLabel: string;
  headline: string;
  bmi: number;
  bmiCategory: string;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  calories: { bmr: number; tdee: number; target: number; delta: number };
  macros: { proteinG: number; fatG: number; carbsG: number; fiberG: number };
  /** Ritmo de cambio de peso esperado (kg/semana, negativo = pierde). */
  weeklyChangeKg: { min: number; max: number };
  training: {
    daysPerWeek: number;
    splitName: string;
    repRange: string;
    setsPerMuscleWeek: string;
    effort: string;
    restSeconds: string;
    progression: string;
    days: PlanDay[];
  };
  cardio: string;
  stepsTarget: number;
  sleepHours: string;
  waterLiters: number;
  notes: string[];
  warnings: string[];
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
};

export const GOAL_TITLE: Record<Goal, string> = {
  lose: "Perder grasa / peso",
  maintain: "Mantener",
  gain: "Ganar peso",
  hypertrophy: "Hipertrofia (ganar músculo)"
};

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Sobrepeso";
  return "Obesidad";
}

/** Umbral de "% grasa alto" según sexo (referencia orientativa). */
const highFat = (g: Gender) => (g === "male" ? 22 : 30);
const lowFat = (g: Gender) => (g === "male" ? 10 : 18);

// ---------------------------------------------------------------------------
// Plantillas de entrenamiento
// ---------------------------------------------------------------------------
const E = (name: string, sets: number, reps: string, presetId?: string): PlanExercise => ({ name, sets, reps, presetId });

function fullBodyDays(rep: { c: string; i: string }, setsC: number, setsI: number): PlanDay[] {
  const A: PlanDay = {
    title: "Día A", focus: "Cuerpo completo",
    exercises: [
      E("Sentadilla", setsC, rep.c, "squat"), E("Press de banca", setsC, rep.c, "bench_press"),
      E("Remo", setsC, rep.c, "row"), E("Press militar", setsI, rep.i, "shoulder_press"),
      E("Curl con barra", setsI, rep.i, "bicep_curl"), E("Plancha", 3, "30–45 s", "plank")
    ]
  };
  const B: PlanDay = {
    title: "Día B", focus: "Cuerpo completo",
    exercises: [
      E("Peso muerto rumano", setsC, rep.c, "romanian_deadlift"), E("Press inclinado", setsC, rep.c, "incline_press"),
      E("Dominadas / jalón", setsC, rep.c, "pull_up"), E("Zancadas", setsI, rep.i, "lunge"),
      E("Elevaciones laterales", setsI, "12–15", "lateral_raise"), E("Extensión polea (tríceps)", setsI, rep.i, "tricep_pushdown")
    ]
  };
  return [A, B, { ...A, title: "Día C" }];
}

function upperLowerDays(rep: { c: string; i: string }, setsC: number, setsI: number): PlanDay[] {
  return [
    { title: "Upper A", focus: "Tren superior (fuerza)", exercises: [
      E("Press de banca", setsC, rep.c, "bench_press"), E("Remo", setsC, rep.c, "row"),
      E("Press militar", setsI, rep.i, "shoulder_press"), E("Dominadas / jalón", setsI, rep.i, "pull_up"),
      E("Curl con barra", setsI, rep.i, "bicep_curl"), E("Extensión polea (tríceps)", setsI, rep.i, "tricep_pushdown")
    ] },
    { title: "Lower A", focus: "Tren inferior (fuerza)", exercises: [
      E("Sentadilla", setsC, rep.c, "squat"), E("Peso muerto rumano", setsC, rep.c, "romanian_deadlift"),
      E("Prensa de piernas", setsI, rep.i, "leg_press"), E("Curl femoral", setsI, rep.i, "leg_curl"),
      E("Elevación de talones", 4, "12–15", "calf_raise")
    ] },
    { title: "Upper B", focus: "Tren superior (volumen)", exercises: [
      E("Press inclinado", setsC, rep.i, "incline_press"), E("Remo", setsC, rep.i, "row"),
      E("Elevaciones laterales", setsI, "12–15", "lateral_raise"), E("Pájaros (reverse fly)", setsI, "12–15", "reverse_fly"),
      E("Curl martillo", setsI, rep.i, "hammer_curl"), E("Skull crusher", setsI, rep.i, "skull_crusher")
    ] },
    { title: "Lower B", focus: "Tren inferior (volumen)", exercises: [
      E("Hip Thrust", setsC, rep.c, "hip_thrust"), E("Búlgara", setsC, rep.i, "bulgarian_split"),
      E("Extensión de cuádriceps", setsI, rep.i, "leg_extension"), E("Curl femoral", setsI, rep.i, "leg_curl"),
      E("Elevación de talones", 4, "12–15", "calf_raise")
    ] }
  ];
}

function pplDays(rep: { c: string; i: string }, setsC: number, setsI: number): PlanDay[] {
  const push: PlanDay = { title: "Push", focus: "Pecho · hombros · tríceps", exercises: [
    E("Press de banca", setsC, rep.c, "bench_press"), E("Press inclinado", setsC, rep.i, "incline_press"),
    E("Press militar", setsI, rep.i, "shoulder_press"), E("Elevaciones laterales", setsI + 1, "12–15", "lateral_raise"),
    E("Extensión polea (tríceps)", setsI, rep.i, "tricep_pushdown")
  ] };
  const pull: PlanDay = { title: "Pull", focus: "Espalda · bíceps", exercises: [
    E("Dominadas / jalón", setsC, rep.c, "pull_up"), E("Remo", setsC, rep.c, "row"),
    E("Face pull", setsI, "12–15", "face_pull"), E("Curl con barra", setsI, rep.i, "bicep_curl"),
    E("Curl martillo", setsI, rep.i, "hammer_curl")
  ] };
  const legs: PlanDay = { title: "Legs", focus: "Piernas · glúteo", exercises: [
    E("Sentadilla", setsC, rep.c, "squat"), E("Peso muerto rumano", setsC, rep.c, "romanian_deadlift"),
    E("Prensa de piernas", setsI, rep.i, "leg_press"), E("Curl femoral", setsI, rep.i, "leg_curl"),
    E("Elevación de talones", 4, "12–15", "calf_raise")
  ] };
  const [upperA, lowerA] = upperLowerDays(rep, setsC, setsI);
  return [push, pull, legs, { ...upperA, title: "Upper" }, { ...lowerA, title: "Lower" }];
}

// ---------------------------------------------------------------------------
export function buildPlan(input: PlanInput): PersonalPlan {
  const { weightKg, heightCm, ageYears, gender, goal, activityLevel, experience } = input;
  const bf = input.bodyFatPct && input.bodyFatPct > 2 && input.bodyFatPct < 70 ? input.bodyFatPct : null;
  const warnings: string[] = [];
  const notes: string[] = [];

  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + (gender === "male" ? 5 : -161));
  const tdee = Math.round(bmr * ACTIVITY_FACTOR[activityLevel]);
  const leanMassKg = bf !== null ? +(weightKg * (1 - bf / 100)).toFixed(1) : null;

  // --- Ajuste calórico según objetivo, composición y experiencia ---
  let goalEff: Goal = goal;
  let delta = 0;
  switch (goal) {
    case "lose": {
      if (bmi < 18.5) {
        goalEff = "maintain"; delta = 0;
        warnings.push("Tu IMC indica bajo peso: no es recomendable un déficit. El plan se ajusta a mantenimiento; consulta con un profesional si quieres perder grasa.");
      } else {
        const lowBf = bf !== null && bf <= lowFat(gender);
        delta = -Math.round(Math.max(300, Math.min(700, tdee * (lowBf ? 0.1 : 0.2))) / 10) * 10;
        if (lowBf) warnings.push(`Con ${bf!.toFixed(1)}% de grasa ya estás bajo: se usa un déficit pequeño para no perder músculo.`);
      }
      break;
    }
    case "maintain": delta = 0; break;
    case "gain": {
      delta = experience === "beginner" ? 450 : 500;
      if (bf !== null && bf >= highFat(gender) + 3) {
        delta = 300;
        warnings.push(`Tu % de grasa (${bf.toFixed(1)}%) es alto: el superávit se reduce a +300 kcal para no acumular demasiada grasa.`);
      }
      break;
    }
    case "hypertrophy": {
      delta = experience === "beginner" ? 350 : experience === "intermediate" ? 250 : 200;
      if (bf !== null && bf >= highFat(gender)) {
        delta = 0;
        notes.push(`Con ${bf.toFixed(1)}% de grasa lo más eficiente es una RECOMPOSICIÓN: calorías de mantenimiento, proteína alta y entrenamiento de fuerza (ganas músculo mientras bajas grasa).`);
      }
      break;
    }
  }
  const target = Math.max(tdee + delta, goalEff === "lose" ? Math.max(bmr, gender === "male" ? 1500 : 1200) : 1200);
  const realDelta = target - tdee;

  // --- Macros ---
  const protFactor =
    goalEff === "lose" ? 2.2 : goalEff === "hypertrophy" ? 2.2 : goalEff === "gain" ? 1.8 : 1.8;
  // Con mucha grasa corporal la proteína se calcula sobre masa magra + margen (evita cifras desmesuradas).
  const protBase = bf !== null && bf >= highFat(gender) + 6 && leanMassKg ? leanMassKg * 1.25 : weightKg;
  const proteinG = Math.round(Math.min(protBase * protFactor, 230));
  const fatG = Math.round(Math.max(weightKg * 0.6, (target * 0.25) / 9));
  const carbsG = Math.max(0, Math.round((target - proteinG * 4 - fatG * 9) / 4));
  const fiberG = Math.round((target / 1000) * 14);

  // --- Ritmo esperado ---
  const kgWeek = (realDelta * 7) / 7700;
  const weeklyChangeKg =
    goalEff === "hypertrophy" || goalEff === "gain"
      ? { min: +Math.max(0, kgWeek * 0.8).toFixed(2), max: +Math.max(0.1, kgWeek * 1.2).toFixed(2) }
      : { min: +(kgWeek * 1.2).toFixed(2), max: +(kgWeek * 0.8).toFixed(2) };

  // --- Entrenamiento ---
  const days = experience === "beginner" ? 3 : experience === "intermediate" ? 4 : 5;
  let repRange = "6–12";
  let effort = "Termina cada serie a 1–3 repeticiones del fallo (RIR 1–3).";
  let restSeconds = "Compuestos 2–3 min · aislados 60–90 s";
  let setsWeek = experience === "beginner" ? "8–10 series/músculo/semana" : experience === "intermediate" ? "12–16 series/músculo/semana" : "16–20 series/músculo/semana";
  let repPair = { c: "6–10", i: "10–12" };
  let setsC = experience === "beginner" ? 3 : 4;
  let setsI = 3;

  if (goalEff === "lose") {
    repRange = "6–10 en básicos (mantén el peso: así conservas el músculo)";
    setsWeek = experience === "beginner" ? "8–10 series/músculo/semana" : "10–14 series/músculo/semana";
    setsC = 3; setsI = 2;
    effort = "No busques el fallo: con déficit la recuperación es menor. RIR 2–3.";
  } else if (goalEff === "gain") {
    repRange = "6–12 con progresión de carga constante";
    repPair = { c: "6–10", i: "10–12" };
  } else if (goalEff === "maintain") {
    setsWeek = "8–10 series/músculo/semana"; setsC = 3; setsI = 2;
  }

  let splitName: string;
  let dayPlans: PlanDay[];
  if (days === 3) { splitName = "Cuerpo completo × 3"; dayPlans = fullBodyDays(repPair, setsC, setsI); }
  else if (days === 4) { splitName = "Torso / Pierna × 4"; dayPlans = upperLowerDays(repPair, setsC, setsI); }
  else { splitName = "Push · Pull · Legs + Torso/Pierna × 5"; dayPlans = pplDays(repPair, setsC, setsI); }

  const steps = goalEff === "lose" ? 10000 : goalEff === "maintain" ? 8000 : 7000;
  const cardio =
    goalEff === "lose"
      ? "2–3 sesiones de cardio suave (30–40 min, ritmo en que puedas hablar) + objetivo de pasos diario."
      : goalEff === "maintain"
      ? "1–2 sesiones de cardio suave por salud cardiovascular."
      : "Cardio mínimo (1–2 sesiones cortas) para no frenar el superávit; prioriza caminar.";

  if (bmi >= 30 && (goal === "gain" || goal === "hypertrophy") && bf === null) {
    warnings.push("Tu IMC es alto y no hay % de grasa: si quieres ganar músculo, la recomposición suele ser mejor que un superávit. Sincroniza la báscula o introduce tu % de grasa en el perfil.");
  }
  if (ageYears < 18) warnings.push("Eres menor de 18: consulta con un profesional antes de seguir un plan con déficit o superávit calórico.");
  notes.push("Pésate 2–3 veces por semana a la misma hora y usa el promedio semanal: si el peso se mueve más rápido/lento de lo esperado, ajusta ±100–150 kcal.");
  notes.push("Progresión doble: cuando llegues al máximo de repeticiones del rango en todas las series, sube el peso un 2,5–5 %.");

  const headline =
    goalEff === "lose" ? `Déficit de ${Math.abs(realDelta)} kcal/día · proteína alta · pesas para conservar músculo`
    : goalEff === "gain" ? `Superávit de +${realDelta} kcal/día · fuerza progresiva`
    : goalEff === "hypertrophy" ? (realDelta > 0 ? `Superávit pequeño (+${realDelta} kcal) · volumen alto · proteína 2.2 g/kg` : "Recomposición · mantenimiento calórico · proteína alta")
    : "Calorías de mantenimiento · constancia";

  return {
    goal, goalLabel: GOAL_TITLE[goal], headline,
    bmi: +bmi.toFixed(1), bmiCategory: bmiCategory(bmi),
    bodyFatPct: bf, leanMassKg,
    calories: { bmr, tdee, target, delta: realDelta },
    macros: { proteinG, fatG, carbsG, fiberG },
    weeklyChangeKg,
    training: {
      daysPerWeek: days, splitName, repRange, setsPerMuscleWeek: setsWeek,
      effort, restSeconds,
      progression: "Progresión doble: sube repeticiones dentro del rango y, al completarlo, sube el peso.",
      days: dayPlans
    },
    cardio, stepsTarget: steps,
    sleepHours: "7–9 h",
    waterLiters: +(Math.max(2, weightKg * 0.035)).toFixed(1),
    notes, warnings
  };
}
