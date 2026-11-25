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
  // --- Originales (19) ---
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
  burpee: BURPEE,

  // --- Extras (variantes + nuevos, reutilizando presets biomecánicos similares) ---
  front_squat: { ...SQUAT, id: "front_squat", name: "Sentadilla frontal", emoji: "🏋️‍♂️", primaryMuscle: "Cuádriceps", calibrationHint: "Mantén el torso vertical, codos arriba." },
  goblet_squat: { ...SQUAT, id: "goblet_squat", name: "Goblet squat", emoji: "🪣", primaryMuscle: "Cuádriceps", calibrationHint: "Pesón pegado al pecho, baja hasta 90°." },
  split_squat: { ...LUNGE, id: "split_squat", name: "Split squat", emoji: "🦵", primaryMuscle: "Glúteo + Cuádriceps", calibrationHint: "Pie atrás en banco o suelo, baja recto." },
  bulgarian_split: { ...LUNGE, id: "bulgarian_split", name: "Búlgara", emoji: "🦵", primaryMuscle: "Glúteo", calibrationHint: "Pie atrás elevado, rodilla 90° al frente." },
  romanian_deadlift: { ...DEADLIFT, id: "romanian_deadlift", name: "Peso muerto rumano", emoji: "🏋️", primaryMuscle: "Isquios", calibrationHint: "Piernas casi rectas, baja con cadera atrás." },
  sumo_deadlift: { ...DEADLIFT, id: "sumo_deadlift", name: "Peso muerto sumo", emoji: "🏋️", primaryMuscle: "Adductores + Glúteo", calibrationHint: "Pies abiertos, manos por dentro." },
  incline_press: { ...BENCH_PRESS, id: "incline_press", name: "Press inclinado", emoji: "🏋️‍♂️", primaryMuscle: "Pecho superior", calibrationHint: "Banco 30°, baja a clavícula." },
  decline_press: { ...BENCH_PRESS, id: "decline_press", name: "Press declinado", emoji: "🏋️‍♂️", primaryMuscle: "Pecho inferior", calibrationHint: "Banco -15°, baja al esternón." },
  dumbbell_curl: { ...CURL, id: "dumbbell_curl", name: "Curl mancuerna", emoji: "💪", primaryMuscle: "Bíceps", calibrationHint: "Codos pegados al cuerpo, sin balanceo." },
  hammer_curl: { ...CURL, id: "hammer_curl", name: "Curl martillo", emoji: "🔨", primaryMuscle: "Bíceps + Braquial", calibrationHint: "Agarre neutro, sube recto." },
  concentration_curl: { ...CURL, id: "concentration_curl", name: "Curl concentración", emoji: "🧘", primaryMuscle: "Bíceps", calibrationHint: "Codo apoyado en muslo, aísla el bíceps." },
  skull_crusher: { ...TRICEP_DIPS, id: "skull_crusher", name: "Skull crusher", emoji: "💀", primaryMuscle: "Tríceps", calibrationHint: "Codos fijos, baja a la frente." },
  tricep_pushdown: { ...TRICEP_DIPS, id: "tricep_pushdown", name: "Extensión polea", emoji: "🔗", primaryMuscle: "Tríceps", calibrationHint: "Codos pegados, extiende abajo." },
  face_pull: { ...ROW, id: "face_pull", name: "Face pull", emoji: "😤", primaryMuscle: "Deltoides posterior", calibrationHint: "Polea alta, tira a la frente." },
  upright_row: { ...LATERAL_RAISE, id: "upright_row", name: "Remo al mentón", emoji: "🏋️", primaryMuscle: "Trapecio + Deltoides", calibrationHint: "Agarre estrecho, sube al mentón." },
  reverse_fly: { ...LATERAL_RAISE, id: "reverse_fly", name: "Pájaros (reverse fly)", emoji: "🐦", primaryMuscle: "Deltoides posterior", calibrationHint: "Inclinado, abre brazos lateral." },
  leg_curl: { ...LEG_EXTENSION, id: "leg_curl", name: "Curl femoral", emoji: "🦵", primaryMuscle: "Isquios", calibrationHint: "Máquina tumbado, dobla rodillas." },
  hip_abductor: { ...HIP_THRUST, id: "hip_abductor", name: "Abductor cadera", emoji: "🦵", primaryMuscle: "Glúteo medio", calibrationHint: "Máquina, abre piernas controlado." },
  hanging_leg_raise: { ...RUSSIAN_TWIST, id: "hanging_leg_raise", name: "Elevación piernas", emoji: "🤸", primaryMuscle: "Abdomen", calibrationHint: "Colgado, sube piernas a 90°." },
  plank_shoulder_tap: { ...PLANK, id: "plank_shoulder_tap", name: "Plancha toque hombro", emoji: "👋", primaryMuscle: "Core", calibrationHint: "Plancha, toca hombro alternante." },
  mountain_climber: { ...BURPEE, id: "mountain_climber", name: "Escalador", emoji: "⛰️", primaryMuscle: "Core + Cardio", calibrationHint: "Plancha, rodilla al pecho alternando." },
  jump_rope: { ...JUMPING_JACK, id: "jump_rope", name: "Saltar cuerda", emoji: "🪢", primaryMuscle: "Cardio", calibrationHint: "Saltos bajos, ritmo constante." },
  high_knees: { ...JUMPING_JACK, id: "high_knees", name: "Rodillas arriba", emoji: "🏃", primaryMuscle: "Cardio", calibrationHint: "Rodillas a la cintura, rápido." },

  // --- ANTEBRAZOS (5 nuevos) ---
  wrist_curl: { ...CURL, id: "wrist_curl", name: "Curl de muñeca", emoji: "✊", primaryMuscle: "Antebrazo (flexores)", calibrationHint: "Antebrazos en banco, mueve solo la muñeca." },
  reverse_wrist_curl: { ...CURL, id: "reverse_wrist_curl", name: "Curl muñeca invertido", emoji: "✋", primaryMuscle: "Antebrazo (extensores)", calibrationHint: "Palmas abajo, sube la muñeca." },
  reverse_curl_bar: { ...CURL, id: "reverse_curl_bar", name: "Curl invertido barra", emoji: "💪", primaryMuscle: "Antebrazo + Braquial", calibrationHint: "Agarre prono, sube sin balanceo." },
  farmer_walk: { ...DEADLIFT, id: "farmer_walk", name: "Marcha del granjero", emoji: "🚶", primaryMuscle: "Antebrazo + Core", calibrationHint: "Mancuernas pesadas, camina recto." },
  towel_pull_up: { ...PULL_UP, id: "towel_pull_up", name: "Dominadas con toalla", emoji: "🧻", primaryMuscle: "Antebrazo + Espalda", calibrationHint: "Agarra toalla sobre barra, sube." },

  // --- MÁQUINAS (12 nuevos) ---
  hack_squat: { ...SQUAT, id: "hack_squat", name: "Hack squat", emoji: "🛠️", primaryMuscle: "Cuádriceps", calibrationHint: "Espalda en soporte, baja a 90°." },
  leg_press_narrow: { ...LEG_PRESS, id: "leg_press_narrow", name: "Prensa pies juntos", emoji: "🛠️", primaryMuscle: "Cuádriceps", calibrationHint: "Pies juntos abajo, empuja." },
  leg_press_wide: { ...LEG_PRESS, id: "leg_press_wide", name: "Prensa pies abiertos", emoji: "🛠️", primaryMuscle: "Adductores + Glúteo", calibrationHint: "Pies arriba y abiertos." },
  smith_squat: { ...SQUAT, id: "smith_squat", name: "Sentadilla Smith", emoji: "🛠️", primaryMuscle: "Cuádriceps", calibrationHint: "Barra guiada, baja controlado." },
  smith_press: { ...SHOULDER_PRESS, id: "smith_press", name: "Press hombro Smith", emoji: "🛠️", primaryMuscle: "Deltoides", calibrationHint: "Barra guiada, sube hasta casi tocar." },
  chest_press_machine: { ...BENCH_PRESS, id: "chest_press_machine", name: "Press pecho máquina", emoji: "🛠️", primaryMuscle: "Pecho", calibrationHint: "Espalda en soporte, empuja las palancas." },
  seated_row_machine: { ...ROW, id: "seated_row_machine", name: "Remo sentado máquina", emoji: "🛠️", primaryMuscle: "Espalda", calibrationHint: "Pecho en soporte, tira codos atrás." },
  lat_pulldown: { ...PULL_UP, id: "lat_pulldown", name: "Jalón al pecho", emoji: "🔗", primaryMuscle: "Dorsal", calibrationHint: "Agarre ancho, tira a clavícula." },
  cable_row: { ...ROW, id: "cable_row", name: "Remo en polea", emoji: "🔗", primaryMuscle: "Espalda", calibrationHint: "Tronco recto, tira codos atrás." },
  cable_crossover: { ...BENCH_PRESS, id: "cable_crossover", name: "Cruce en poleas", emoji: "🔗", primaryMuscle: "Pecho", calibrationHint: "Inclinado adelante, cruza manos." },
  machine_shoulder_press: { ...SHOULDER_PRESS, id: "machine_shoulder_press", name: "Press hombro máquina", emoji: "🛠️", primaryMuscle: "Deltoides", calibrationHint: "Espalda en soporte, empuja arriba." },
  cable_lateral_raise: { ...LATERAL_RAISE, id: "cable_lateral_raise", name: "Elevación lateral polea", emoji: "🔗", primaryMuscle: "Deltoides medio", calibrationHint: "Polea baja, sube lateral." },

  // --- POLEAS/CABLES adicionales (5 nuevos) ---
  cable_bicep_curl: { ...CURL, id: "cable_bicep_curl", name: "Curl en polea", emoji: "🔗", primaryMuscle: "Bíceps", calibrationHint: "Polea baja, codos fijos." },
  cable_woodchopper: { ...RUSSIAN_TWIST, id: "cable_woodchopper", name: "Leñador en polea", emoji: "🪓", primaryMuscle: "Oblicuos", calibrationHint: "Polea alta, rota abajo cruzando." },
  tricep_rope_pushdown: { ...TRICEP_DIPS, id: "tricep_rope_pushdown", name: "Extensión cuerda", emoji: "🔗", primaryMuscle: "Tríceps", calibrationHint: "Cuerda, abre al final." },
  single_arm_row: { ...ROW, id: "single_arm_row", name: "Remo a una mano", emoji: "🔗", primaryMuscle: "Espalda", calibrationHint: "Polea baja, una mano, codo atrás." },
  cable_kickback: { ...TRICEP_DIPS, id: "cable_kickback", name: "Patada tríceps polea", emoji: "🔗", primaryMuscle: "Tríceps", calibrationHint: "Codo fijo, extiende atrás." },

  // --- CALISTENIA adicional (6 nuevos) ---
  diamond_push_up: { ...PUSH_UP, id: "diamond_push_up", name: "Flexión diamante", emoji: "💎", primaryMuscle: "Tríceps + Pecho", calibrationHint: "Manos en triángulo, baja controlado." },
  wide_push_up: { ...PUSH_UP, id: "wide_push_up", name: "Flexión abierta", emoji: "🤲", primaryMuscle: "Pecho externo", calibrationHint: "Manos abiertas, baja recto." },
  pike_push_up: { ...SHOULDER_PRESS, id: "pike_push_up", name: "Flexión pica", emoji: "🔻", primaryMuscle: "Deltoides", calibrationHint: "Cadera arriba, baja cabeza al suelo." },
  chin_up: { ...PULL_UP, id: "chin_up", name: "Dominadas supinas", emoji: "💪", primaryMuscle: "Bíceps + Espalda", calibrationHint: "Agarre supino, barra al mentón." },
  hanging_knee_raise: { ...RUSSIAN_TWIST, id: "hanging_knee_raise", name: "Rodillas colgado", emoji: "🤸", primaryMuscle: "Abdomen", calibrationHint: "Colgado, sube rodillas al pecho." },
  l_sit: { ...PLANK, id: "l_sit", name: "L-sit", emoji: "🪑", primaryMuscle: "Core + Cuádriceps", calibrationHint: "Piernas rectas a 90°, sosten." },

  // --- PESAS LIBRES adicionales (8 nuevos) ---
  dumbbell_bench_press: { ...BENCH_PRESS, id: "dumbbell_bench_press", name: "Press mancuernas", emoji: "🏋️", primaryMuscle: "Pecho", calibrationHint: "Mancuernas, baja a 90°." },
  dumbbell_shoulder_press: { ...SHOULDER_PRESS, id: "dumbbell_shoulder_press", name: "Press hombro mancuerna", emoji: "🏋️", primaryMuscle: "Deltoides", calibrationHint: "Mancuernas, codos a 90°." },
  dumbbell_row: { ...ROW, id: "dumbbell_row", name: "Remo mancuerna", emoji: "🏋️", primaryMuscle: "Espalda", calibrationHint: "Tronco inclinado, codo atrás." },
  dumbbell_deadlift: { ...DEADLIFT, id: "dumbbell_deadlift", name: "Peso muerto mancuerna", emoji: "🏋️", primaryMuscle: "Isquios + Glúteo", calibrationHint: "Mancuernas, cadera atrás." },
  dumbbell_lunge: { ...LUNGE, id: "dumbbell_lunge", name: "Zancada mancuerna", emoji: "🚶", primaryMuscle: "Cuádriceps + Glúteo", calibrationHint: "Mancuernas en manos, zancada larga." },
  dumbbell_step_up: { ...LUNGE, id: "dumbbell_step_up", name: "Step up mancuerna", emoji: "🪜", primaryMuscle: "Glúteo + Cuádriceps", calibrationHint: "Sube a banco, empuja con el talón." },
  dumbbell_swing: { ...DEADLIFT, id: "dumbbell_swing", name: "Swing mancuerna", emoji: "⏰", primaryMuscle: "Glúteo + Isquios", calibrationHint: "Mancuernas entre piernas, sube con cadera." },
  kettlebell_swing: { ...DEADLIFT, id: "kettlebell_swing", name: "Swing kettlebell", emoji: "🔔", primaryMuscle: "Glúteo + Isquios", calibrationHint: "Kettlebell entre piernas, sube con cadera." },

  // --- CARDIO adicional (5 nuevos) ---
  box_jump: { ...JUMPING_JACK, id: "box_jump", name: "Salto al cajón", emoji: "📦", primaryMuscle: "Piernas + Cardio", calibrationHint: "Salto alto, aterriza suave." },
  burpee_pull_up: { ...BURPEE, id: "burpee_pull_up", name: "Burpee dominada", emoji: "🔥", primaryMuscle: "Full body + Cardio", calibrationHint: "Burpee, salto a barra, dominada." },
  battle_rope: { ...JUMPING_JACK, id: "battle_rope", name: "Cuerdas de batalla", emoji: "🪢", primaryMuscle: "Hombros + Cardio", calibrationHint: "Cuerdas, alterna brazos rápido." },
  treadmill_sprint: { ...JUMPING_JACK, id: "treadmill_sprint", name: "Sprint cinta", emoji: "🏃", primaryMuscle: "Cardio", calibrationHint: "Velocidad alta, postura erguida." },
  cycling_intervals: { ...JUMPING_JACK, id: "cycling_intervals", name: "Intervalos bici", emoji: "🚴", primaryMuscle: "Piernas + Cardio", calibrationHint: "30s fuerte / 30s suave, repite." }
};

export const PRESET_LIST = Object.values(EXERCISE_PRESETS);
