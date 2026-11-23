/**
 * exercisePresets.ts
 * ----------------------------------------------------------------------------
 * Configuraciones por ejercicio: qué articulación vigilar, umbrales, reglas
 * de fallos biomecánicos.
 *
 * Catálogo ampliado (19 ejercicios) con presets reutilizables.
 */
import type { Landmark } from "./landmarks";
import { PoseLandmark } from "./landmarks";
import { angle2D, signedAngle, torsoInclination } from "./angleUtils";
import type { RepStateMachineConfig } from "./repStateMachine";

export type FaultDetector = (l: Landmark[], side: "L" | "R") => string[];

export interface ExercisePreset {
  id: string;
  name: string;
  category: "free_weight" | "machine" | "cable" | "calisthenic" | "cardio";
  primaryMuscle: string;
  preferredSide: "L" | "R";
  stateMachine: RepStateMachineConfig;
  faults: FaultDetector[];
  calibrationHint: string;
  /** Emoji corto para el selector visual. */
  emoji: string;
}

const side = (L: number, R: number, s: "L" | "R") => (s === "L" ? L : R);

// ============================================================================
// F detectors reutilizables
// ============================================================================
const depthFault = (jointA: number, jointB: number, sideFlag: "L" | "R"): FaultDetector =>
  (l, s) => {
    const a = l[side(jointA, jointA, s)];
    const b = l[side(jointB, jointB, s)];
    if (a && b && a.y < b.y - 0.05) return ["DEPTH_SHORT"];
    return [];
  };

const torsoLeanFault = (maxDeg: number): FaultDetector => (l, s) => {
  const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
  const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
  if (shoulder && hip) {
    const inc = torsoInclination(shoulder, hip);
    if (inc > maxDeg) return ["TORSO_LEAN"];
  }
  return [];
};

const valgusFault = (): FaultDetector => (l, s) => {
  const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
  const knee = l[side(PoseLandmark.LEFT_KNEE, PoseLandmark.RIGHT_KNEE, s)];
  const ankle = l[side(PoseLandmark.LEFT_ANKLE, PoseLandmark.RIGHT_ANKLE, s)];
  if (hip && knee && ankle) {
    const sa = signedAngle(hip, knee, ankle);
    if (Math.abs(sa) > 12) return ["KNEE_VALGUS"];
  }
  return [];
};

const partialRomFault = (triplet: [number, number, number], minOpenDeg: number): FaultDetector =>
  (l, s) => {
    const [a, b, c] = triplet;
    const A = l[side(a, a, s)], B = l[side(b, b, s)], C = l[side(c, c, s)];
    if (A && B && C) {
      const ang = angle2D(A, B, C);
      if (ang < minOpenDeg) return ["PARTIAL_TOP"];
    }
    return [];
  };

const backArchFault = (): FaultDetector => (l, s) => {
  const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
  const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
  if (shoulder && hip) {
    const dx = shoulder.x - hip.x;
    if (Math.abs(dx) > 0.08) return ["BACK_ARCH"];
  }
  return [];
};

// ============================================================================
// Ejercicios
// ============================================================================

export const SQUAT: ExercisePreset = {
  id: "squat",
  name: "Sentadilla",
  category: "free_weight",
  primaryMuscle: "Cuádriceps",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    topAngleDeg: 170,
    bottomAngleDeg: 90,
    hysteresisDeg: 8,
    pauseMsThreshold: 250,
    romToleranceDeg: 15
  },
  faults: [depthFault(PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, "L"), valgusFault(), torsoLeanFault(45)],
  calibrationHint: "Colócate de perfil, todo el cuerpo visible de cabeza a pies.",
  emoji: "🦵"
};

export const CURL: ExercisePreset = {
  id: "bicep_curl",
  name: "Curl con barra",
  category: "free_weight",
  primaryMuscle: "Bíceps",
  preferredSide: "R",
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    topAngleDeg: 160,
    bottomAngleDeg: 35,
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 20
  },
  faults: [torsoLeanFault(20), partialRomFault([PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST], 150)],
  calibrationHint: "De perfil, bíceps visible. El codo debe permanecer pegado al cuerpo.",
  emoji: "💪"
};

export const SHOULDER_PRESS: ExercisePreset = {
  id: "shoulder_press",
  name: "Press Militar",
  category: "free_weight",
  primaryMuscle: "Hombros",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    topAngleDeg: 170,
    bottomAngleDeg: 70,
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 20
  },
  faults: [backArchFault()],
  calibrationHint: "De perfil, tren superior visible. Hombros a la altura de las orejas.",
  emoji: "🏋️"
};

export const PUSH_UP: ExercisePreset = {
  id: "push_up",
  name: "Flexiones",
  category: "calisthenic",
  primaryMuscle: "Pecho",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
    topAngleDeg: 170,
    bottomAngleDeg: 80,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [torsoLeanFault(15)],
  calibrationHint: "De perfil, cuerpo recto. Baja hasta que el pecho casi toque el suelo.",
  emoji: "🤸"
};

export const BENCH_PRESS: ExercisePreset = {
  id: "bench_press",
  name: "Press de banca",
  category: "free_weight",
  primaryMuscle: "Pecho",
  preferredSide: "R",
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    topAngleDeg: 170,
    bottomAngleDeg: 75,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [partialRomFault([PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST], 150)],
  calibrationHint: "De perfil acostado. La barra baja hasta el pecho.",
  emoji: "🛏️"
};

export const DEADLIFT: ExercisePreset = {
  id: "deadlift",
  name: "Peso muerto",
  category: "free_weight",
  primaryMuscle: "Espalda/Femoral",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
    topAngleDeg: 170,
    bottomAngleDeg: 70,
    hysteresisDeg: 10,
    pauseMsThreshold: 300,
    romToleranceDeg: 20
  },
  faults: [torsoLeanFault(35), backArchFault()],
  calibrationHint: "De perfil, barra pegada al cuerpo. Cadera y hombros suben a la vez.",
  emoji: "🏋️‍♂️"
};

export const LUNGE: ExercisePreset = {
  id: "lunge",
  name: "Zancadas",
  category: "free_weight",
  primaryMuscle: "Cuádriceps/Glúteo",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    topAngleDeg: 170,
    bottomAngleDeg: 95,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [valgusFault(), torsoLeanFault(20)],
  calibrationHint: "De perfil. La rodilla delantera no pasa la punta del pie.",
  emoji: "🚶"
};

export const PLANK: ExercisePreset = {
  id: "plank",
  name: "Plancha",
  category: "calisthenic",
  primaryMuscle: "Core",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_ANKLE],
    topAngleDeg: 175,
    bottomAngleDeg: 165,
    hysteresisDeg: 5,
    pauseMsThreshold: 500,
    romToleranceDeg: 10
  },
  faults: [torsoLeanFault(15)],
  calibrationHint: "De perfil. Cuerpo recto de cabeza a pies, sin hundir cadera.",
  emoji: "🧘"
};

export const PULL_UP: ExercisePreset = {
  id: "pull_up",
  name: "Dominadas",
  category: "calisthenic",
  primaryMuscle: "Espalda",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    topAngleDeg: 175,
    bottomAngleDeg: 80,
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [partialRomFault([PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW], 120)],
  calibrationHint: "De perfil. Sube hasta que la barbilla supere la barra.",
  emoji: "🆙"
};

export const ROW: ExercisePreset = {
  id: "row",
  name: "Remo",
  category: "free_weight",
  primaryMuscle: "Espalda",
  preferredSide: "R",
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_HIP],
    topAngleDeg: 175,
    bottomAngleDeg: 60,
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [torsoLeanFault(30)],
  calibrationHint: "De perfil. Espalda recta, tira del codo hacia atrás.",
  emoji: "🚣"
};

export const LATERAL_RAISE: ExercisePreset = {
  id: "lateral_raise",
  name: "Elevaciones laterales",
  category: "free_weight",
  primaryMuscle: "Hombros",
  preferredSide: "R",
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_WRIST],
    topAngleDeg: 90,
    bottomAngleDeg: 20,
    hysteresisDeg: 5,
    pauseMsThreshold: 150,
    romToleranceDeg: 10
  },
  faults: [torsoLeanFault(10)],
  calibrationHint: "De perfil. Sube los brazos hasta la altura del hombro.",
  emoji: "🦅"
};

export const LEG_PRESS: ExercisePreset = {
  id: "leg_press",
  name: "Prensa de piernas",
  category: "machine",
  primaryMuscle: "Cuádriceps",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    topAngleDeg: 170,
    bottomAngleDeg: 70,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [valgusFault()],
  calibrationHint: "De perfil. Rodillas flexionan a 90° sin sobrepasar la punta del pie.",
  emoji: "🦵"
};

export const HIP_THRUST: ExercisePreset = {
  id: "hip_thrust",
  name: "Hip Thrust",
  category: "free_weight",
  primaryMuscle: "Glúteos",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
    topAngleDeg: 180,
    bottomAngleDeg: 130,
    hysteresisDeg: 8,
    pauseMsThreshold: 250,
    romToleranceDeg: 15
  },
  faults: [torsoLeanFault(20)],
  calibrationHint: "De perfil. Sube la cadera hasta alinear hombro-cadera-rodilla.",
  emoji: "🍑"
};

export const RUSSIAN_TWIST: ExercisePreset = {
  id: "russian_twist",
  name: "Russian Twist",
  category: "calisthenic",
  primaryMuscle: "Core oblicuos",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_WRIST],
    topAngleDeg: 175,
    bottomAngleDeg: 145,
    hysteresisDeg: 10,
    pauseMsThreshold: 150,
    romToleranceDeg: 15
  },
  faults: [],
  calibrationHint: "Sentado, torso inclinado 45°, rota tocando el suelo a cada lado.",
  emoji: "🌀"
};

export const JUMPING_JACK: ExercisePreset = {
  id: "jumping_jack",
  name: "Jumping Jacks",
  category: "cardio",
  primaryMuscle: "Full body cardio",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_WRIST],
    topAngleDeg: 175,
    bottomAngleDeg: 60,
    hysteresisDeg: 12,
    pauseMsThreshold: 100,
    romToleranceDeg: 20
  },
  faults: [],
  calibrationHint: "De frente o perfil. Salta abriendo brazos y piernas simultáneamente.",
  emoji: "⭐"
};

export const TRICEP_DIPS: ExercisePreset = {
  id: "tricep_dips",
  name: "Fondos de tríceps",
  category: "calisthenic",
  primaryMuscle: "Tríceps",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
    topAngleDeg: 175,
    bottomAngleDeg: 80,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [torsoLeanFault(20)],
  calibrationHint: "De perfil. Baja flexionando el codo a 90° sin avanzar el hombro.",
  emoji: "💪"
};

export const LEG_EXTENSION: ExercisePreset = {
  id: "leg_extension",
  name: "Extensión de cuádriceps",
  category: "machine",
  primaryMuscle: "Cuádriceps",
  preferredSide: "R",
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
    topAngleDeg: 175,
    bottomAngleDeg: 95,
    hysteresisDeg: 8,
    pauseMsThreshold: 200,
    romToleranceDeg: 15
  },
  faults: [],
  calibrationHint: "De perfil sentado. Extiende las piernas completamente.",
  emoji: "🦿"
};

export const CALF_RAISE: ExercisePreset = {
  id: "calf_raise",
  name: "Elevación de talones",
  category: "free_weight",
  primaryMuscle: "Gemelos",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL],
    topAngleDeg: 175,
    bottomAngleDeg: 130,
    hysteresisDeg: 5,
    pauseMsThreshold: 150,
    romToleranceDeg: 10
  },
  faults: [],
  calibrationHint: "De perfil. Sube en puntas de pie tan alto como puedas.",
  emoji: "🦶"
};

export const BURPEE: ExercisePreset = {
  id: "burpee",
  name: "Burpees",
  category: "cardio",
  primaryMuscle: "Full body cardio",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
    topAngleDeg: 175,
    bottomAngleDeg: 70,
    hysteresisDeg: 15,
    pauseMsThreshold: 100,
    romToleranceDeg: 25
  },
  faults: [],
  calibrationHint: "Cuerpo completo visible. Salta, baja a plancha, vuelve a saltar.",
  emoji: "🔥"
};

// ============================================================================
// Catálogo ampliado
// ============================================================================
export const EXERCISE_PRESETS: Record<string, ExercisePreset> = {
  squat: SQUAT,
  bicep_curl: CURL,
  shoulder_press: SHOULDER_PRESS,
  push_up: PUSH_UP,
  bench_press: BENCH_PRESS,
  deadlift: DEADLIFT,
  lunge: LUNGE,
  plank: PLANK,
  pull_up: PULL_UP,
  row: ROW,
  lateral_raise: LATERAL_RAISE,
  leg_press: LEG_PRESS,
  hip_thrust: HIP_THRUST,
  russian_twist: RUSSIAN_TWIST,
  jumping_jack: JUMPING_JACK,
  tricep_dips: TRICEP_DIPS,
  leg_extension: LEG_EXTENSION,
  calf_raise: CALF_RAISE,
  burpee: BURPEE
};

export const PRESET_LIST = Object.values(EXERCISE_PRESETS);
