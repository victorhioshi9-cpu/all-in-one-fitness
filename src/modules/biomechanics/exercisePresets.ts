/**
 * exercisePresets.ts
 * ----------------------------------------------------------------------------
 * Configuraciones por ejercicio: qué articulación vigilar, umbrales, reglas
 * de fallos biomecánicos.
 *
 * Cada preset especifica:
 *   - El triplet de landmarks para el ángulo principal
 *   - topAngle / bottomAngle para la máquina de estados
 *   - Reglas de fallos (function que recibe landmarks y emite códigos)
 */
import type { Landmark } from "./landmarks";
import { PoseLandmark } from "./landmarks";
import { angle2D, signedAngle, torsoInclination } from "./angleUtils";
import type { RepStateMachineConfig } from "./repStateMachine";

export type FaultDetector = (l: Landmark[], side: "L" | "R") => string[];

export interface ExercisePreset {
  id: string;
  name: string;
  category: "free_weight" | "machine" | "cable" | "calisthenic";
  primaryMuscle: string;
  /** "L" = perfil izquierdo (el lado visible del cuerpo está a la izquierda del frame). */
  preferredSide: "L" | "R";
  stateMachine: RepStateMachineConfig;
  /** Detectores de fallos biomecánicos. */
  faults: FaultDetector[];
  /** Mostrar instructions de calibración en pantalla. */
  calibrationHint: string;
}

// --- Helpers para referenciar landmarks por lado ---------------------------
const side = (L: number, R: number, s: "L" | "R") => (s === "L" ? L : R);

// ============================================================================
// SENTADILLA (Squat)
// ============================================================================
const squatFaults: FaultDetector[] = [
  // 1) Profundidad corta: la cadera no baja lo suficiente.
  (l, s) => {
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    const knee = l[side(PoseLandmark.LEFT_KNEE, PoseLandmark.RIGHT_KNEE, s)];
    // Si la cadera está por encima de la rodilla (en y), está incompleta.
    if (hip && knee && hip.y < knee.y - 0.05) {
      return ["SQUAT_DEPTH_SHORT"];
    }
    return [];
  },
  // 2) Valgo de rodilla: rodilla entra hacia dentro respecto a la línea cadera-tobillo.
  (l, s) => {
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    const knee = l[side(PoseLandmark.LEFT_KNEE, PoseLandmark.RIGHT_KNEE, s)];
    const ankle = l[side(PoseLandmark.LEFT_ANKLE, PoseLandmark.RIGHT_ANKLE, s)];
    if (hip && knee && ankle) {
      // Signed angle: si coge signo contrario al esperado, hay valgo/varo.
      const sa = signedAngle(hip, knee, ankle);
      // En una sentadilla correcta, el signo debe ser cercano a 0 (±5°).
      // En valgo, la rodilla se va hacia dentro: el ángulo firmado cambia.
      if (Math.abs(sa) > 12) return ["SQUAT_KNEE_VALGUS"];
    }
    return [];
  },
  // 3) Inclinación excesiva del torso ("good morning squat")
  (l, s) => {
    const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    if (shoulder && hip) {
      const inc = torsoInclination(shoulder, hip);
      if (inc > 45) return ["SQUAT_TORSO_LEAN"];
    }
    return [];
  },
];

export const SQUAT: ExercisePreset = {
  id: "squat",
  name: "Sentadilla",
  category: "free_weight",
  primaryMuscle: "quadriceps",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    topAngleDeg: 170,
    bottomAngleDeg: 90,        // paralelo: cadera a la altura de la rodilla
    hysteresisDeg: 8,
    pauseMsThreshold: 250,
    romToleranceDeg: 15        // hasta 105° cuenta como rep "completa"
  },
  faults: squatFaults,
  calibrationHint: "Colócate de perfil, todo el cuerpo visible de cabeza a pies."
};

// ============================================================================
// CURL CON BARRA / BARRA Z (Bicep Curl)
// ============================================================================
const curlFaults: FaultDetector[] = [
  // 1) Balanceo de torso: el usuario se balancea para ganar impulso.
  (l, s) => {
    const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    if (shoulder && hip) {
      const inc = torsoInclination(shoulder, hip);
      if (inc > 20) return ["CURL_TORSO_SWING"];
    }
    return [];
  },
  // 2) Codo avanzando: el codo se desplaza hacia adelante en la fase concéntrica.
  (l, s) => {
    const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
    const elbow = l[side(PoseLandmark.LEFT_ELBOW, PoseLandmark.RIGHT_ELBOW, s)];
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    if (shoulder && elbow && hip) {
      // Si el codo está más adelantado (x mayor) que el hombro en curl, hay avance.
      const elbowForward = Math.abs(elbow.x - shoulder.x);
      if (elbowForward > 0.06) return ["CURL_ELBOW_FORWARD"];
    }
    return [];
  },
  // 3) Rep incompleta: no extiende el codo en la fase excéntrica.
  //    (Esto lo cubre el state machine con `fullRom`, pero añadimos el código
  //    para que el HUD lo muestre explícitamente.)
  (l, s) => {
    const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
    const elbow = l[side(PoseLandmark.LEFT_ELBOW, PoseLandmark.RIGHT_ELBOW, s)];
    const wrist = l[side(PoseLandmark.LEFT_WRIST, PoseLandmark.RIGHT_WRIST, s)];
    if (shoulder && elbow && wrist) {
      const ang = angle2D(shoulder, elbow, wrist);
      if (ang > 170) return []; // bien
      if (ang < 150) return ["CURL_PARTIAL_TOP"]; // media rep arriba
    }
    return [];
  },
];

export const CURL: ExercisePreset = {
  id: "bicep_curl",
  name: "Curl con barra",
  category: "free_weight",
  primaryMuscle: "biceps",
  preferredSide: "R",          // perfil derecho para diestros
  stateMachine: {
    triplet: [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    topAngleDeg: 160,          // codo casi extendido
    bottomAngleDeg: 35,        // codo flexionado al máximo (mano cerca del hombro)
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 20
  },
  faults: curlFaults,
  calibrationHint: "De perfil, bíceps visible. El codo debe permanecer pegado al cuerpo."
};

// ============================================================================
// PRESS MILITAR (Shoulder Press) - simplificado
// ============================================================================
const shoulderPressFaults: FaultDetector[] = [
  (l, s) => {
    // Arqueo lumbar: torso inclinado hacia atrás
    const shoulder = l[side(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER, s)];
    const hip = l[side(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP, s)];
    if (shoulder && hip) {
      // Si el hombro está muy por detrás de la cadera en x, hay hiperextensión.
      const dx = shoulder.x - hip.x;
      if (Math.abs(dx) > 0.08) return ["PRESS_BACK_ARCH"];
    }
    return [];
  }
];

export const SHOULDER_PRESS: ExercisePreset = {
  id: "shoulder_press",
  name: "Press Militar",
  category: "free_weight",
  primaryMuscle: "delts",
  preferredSide: "L",
  stateMachine: {
    triplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    topAngleDeg: 170,
    bottomAngleDeg: 70,
    hysteresisDeg: 10,
    pauseMsThreshold: 200,
    romToleranceDeg: 20
  },
  faults: shoulderPressFaults,
  calibrationHint: "De perfil, tren superior visible. Hombros a la altura de las orejas."
};

// ============================================================================
// Catálogo
// ============================================================================
export const EXERCISE_PRESETS: Record<string, ExercisePreset> = {
  squat: SQUAT,
  bicep_curl: CURL,
  shoulder_press: SHOULDER_PRESS
};

export const PRESET_LIST = Object.values(EXERCISE_PRESETS);
