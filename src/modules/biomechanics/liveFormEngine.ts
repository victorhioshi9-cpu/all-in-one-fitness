/**
 * liveFormEngine.ts
 * ----------------------------------------------------------------------------
 * Motor en vivo del Coach: a partir de la pose de ML Kit (formato plano que
 * entrega usePoseDetection) hace TRES cosas para el ejercicio seleccionado:
 *
 *   1) Cuenta repeticiones usando el ángulo articular del preset (rodilla en
 *      sentadilla, codo en curl, etc.) con umbrales relativos al rango de
 *      movimiento (ROM). Es sensible: cuenta desde ~40% del ROM; si no llegó
 *      a profundidad completa la cuenta pero la marca como PARCIAL.
 *   2) Evalúa la técnica cuadro a cuadro -> "good" | "bad" | "unknown", con
 *      histéresis para que el cuadro no parpadee entre rojo y verde.
 *   3) Da avisos por repetición ("Rep parcial: baja más").
 */
import type { ExercisePreset } from "./exercisePresets";
import type { Landmark } from "./landmarks";
import { PoseLandmark } from "./landmarks";
import { angle2D, smooth, torsoInclination } from "./angleUtils";
import { detectFaults, faultMessage } from "./faultDetector";

export type FormState = "good" | "bad" | "unknown";

export interface LiveSnapshot {
  count: number;
  partialCount: number;
  angle: number;
  phase: "up" | "down";
  formState: FormState;
  message: string | null;
  bodyVisible: boolean;
  /** false en ejercicios isométricos (plancha, L-sit): no hay reps que contar. */
  supportsReps: boolean;
}

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  count: 0, partialCount: 0, angle: 0, phase: "up",
  formState: "unknown", message: null, bodyVisible: false, supportsReps: true
};

// ---------------------------------------------------------------------------
// Pose plana de ML Kit -> Landmark[33]
// ---------------------------------------------------------------------------
const NAME_TO_INDEX: Record<string, number> = {
  nosePosition: PoseLandmark.NOSE,
  leftEyePosition: PoseLandmark.LEFT_EYE, rightEyePosition: PoseLandmark.RIGHT_EYE,
  leftEarPosition: PoseLandmark.LEFT_EAR, rightEarPosition: PoseLandmark.RIGHT_EAR,
  leftShoulderPosition: PoseLandmark.LEFT_SHOULDER, rightShoulderPosition: PoseLandmark.RIGHT_SHOULDER,
  leftElbowPosition: PoseLandmark.LEFT_ELBOW, rightElbowPosition: PoseLandmark.RIGHT_ELBOW,
  leftWristPosition: PoseLandmark.LEFT_WRIST, rightWristPosition: PoseLandmark.RIGHT_WRIST,
  leftHipPosition: PoseLandmark.LEFT_HIP, rightHipPosition: PoseLandmark.RIGHT_HIP,
  leftKneePosition: PoseLandmark.LEFT_KNEE, rightKneePosition: PoseLandmark.RIGHT_KNEE,
  leftAnklePosition: PoseLandmark.LEFT_ANKLE, rightAnklePosition: PoseLandmark.RIGHT_ANKLE
};

/**
 * IMPORTANTE: x e y se dividen por la MISMA cantidad (alto del frame) para no
 * deformar los ángulos. Si se normalizara x por el ancho e y por el alto, los
 * ángulos saldrían distorsionados (el frame es 3:4).
 */
export function flatPoseToLandmarks(pose: Record<string, number>): Landmark[] {
  const h = pose._frameH || 640;
  const out: Landmark[] = new Array(33);
  for (const name of Object.keys(NAME_TO_INDEX)) {
    const x = pose[name + "_x"];
    const y = pose[name + "_y"];
    if (typeof x === "number" && typeof y === "number") {
      out[NAME_TO_INDEX[name]] = { x: x / h, y: y / h, z: 0, v: 1, p: 1 };
    }
  }
  return out;
}

/** Misma articulación del lado contrario (izq = impar, der = par en MediaPipe). */
const mirrorIdx = (i: number) => (i >= 11 ? (i % 2 === 1 ? i + 1 : i - 1) : i);

// ---------------------------------------------------------------------------
// Parámetros (ajustables)
// ---------------------------------------------------------------------------
const START_FRAC = 0.35;     // empieza el movimiento al recorrer 35% del ROM (antes 20%)
const COUNT_FRAC = 0.6;      // cuenta la rep si llegó al 60% del ROM (antes 40%)
const RETURN_FRAC = 0.2;     // vuelve a "arriba" a menos del 20% del ROM (antes 15%)
const MIN_RANGE_DEG = 35;    // por debajo: ejercicio isométrico, sin conteo (antes 25)
const MIN_REP_GAP_MS = 600;  // anti doble conteo (antes 350ms)
const GOOD_AFTER_FRAMES = 8;
const BAD_AFTER_FRAMES = 5;
const LOST_AFTER_FRAMES = 15;
const NOTICE_MS = 1800;

/**
 * Faltas que dependen de la FASE del movimiento. Aplicadas cuadro a cuadro
 * dan falsos positivos permanentes (estando de pie la cadera siempre está
 * "más arriba que la rodilla"), por eso se juzgan al terminar la rep.
 */
const REP_LEVEL_CODES = new Set(["DEPTH_SHORT", "PARTIAL_TOP", "SQUAT_DEPTH_SHORT", "CURL_PARTIAL_TOP"]);
/** KNEE_VALGUS original usa signedAngle (≈180° en pierna recta): siempre dispara. Se reemplaza. */
const REPLACED_CODES = new Set(["KNEE_VALGUS", "SQUAT_KNEE_VALGUS"]);

export class LiveFormEngine {
  private angleS: number | null = null;
  private phase: "up" | "down" = "up";
  private minAngle = 180;
  private count = 0;
  private partial = 0;
  private lastCountTs = 0;
  private notice: { text: string; until: number } | null = null;

  private state: FormState = "unknown";
  private candidate: FormState = "unknown";
  private candidateN = 0;
  private lostN = 0;
  private lastMessage: string | null = null;

  private readonly top: number;
  private readonly bottom: number;
  private readonly range: number;
  readonly supportsReps: boolean;

  constructor(private preset: ExercisePreset) {
    this.top = preset.stateMachine.topAngleDeg;
    this.bottom = preset.stateMachine.bottomAngleDeg;
    this.range = this.top - this.bottom;
    this.supportsReps = this.range >= MIN_RANGE_DEG;
  }

  setCount(n: number) { this.count = Math.max(0, n); }
  reset() { this.count = 0; this.partial = 0; this.phase = "up"; this.minAngle = 180; this.angleS = null; this.notice = null; }

  update(pose: Record<string, number> | null, nowMs: number): LiveSnapshot {
    if (!pose) return this.lose();
    const lm = flatPoseToLandmarks(pose);

    // --- ángulo del preset (con lado contrario si falta algún punto) ---
    const [a0, b0, c0] = this.preset.stateMachine.triplet;
    let t: [Landmark?, Landmark?, Landmark?] = [lm[a0], lm[b0], lm[c0]];
    if (!t[0] || !t[1] || !t[2]) t = [lm[mirrorIdx(a0)], lm[mirrorIdx(b0)], lm[mirrorIdx(c0)]];
    if (!t[0] || !t[1] || !t[2]) return this.lose();

    this.lostN = 0;
    const raw = angle2D(t[0]!, t[1]!, t[2]!);
    this.angleS = this.angleS === null ? raw : smooth(this.angleS, raw, 0.4);
    const angle = this.angleS;

    if (this.supportsReps) this.stepCounter(angle, nowMs);

    // --- técnica en vivo ---
    const fault = this.liveFault(lm, angle);
    this.lastMessage = fault;
    this.applyHysteresis(fault ? "bad" : "good");

    const noticeActive = this.notice && nowMs < this.notice.until;
    return {
      count: this.count,
      partialCount: this.partial,
      angle,
      phase: this.phase,
      formState: noticeActive ? "bad" : this.state,
      message: noticeActive ? this.notice!.text : (this.state === "bad" ? this.lastMessage : null),
      bodyVisible: true,
      supportsReps: this.supportsReps
    };
  }

  // ------------------------------------------------------------------------
  private stepCounter(angle: number, now: number) {
    const downAt = this.top - START_FRAC * this.range;
    const upAt = this.top - RETURN_FRAC * this.range;
    const countAt = this.top - COUNT_FRAC * this.range;

    if (this.phase === "up") {
      if (angle < downAt) { this.phase = "down"; this.minAngle = angle; }
    } else {
      this.minAngle = Math.min(this.minAngle, angle);
      if (angle > upAt) {
        const reached = this.minAngle <= countAt;
        if (reached && now - this.lastCountTs >= MIN_REP_GAP_MS) {
          this.count++;
          this.lastCountTs = now;
          const full = this.minAngle <= this.bottom + this.preset.stateMachine.romToleranceDeg;
          if (!full) {
            this.partial++;
            this.notice = { text: "Rep parcial: recorre más el movimiento", until: now + NOTICE_MS };
          }
        }
        this.phase = "up";
        this.minAngle = 180;
      }
    }
  }

  private liveFault(lm: Landmark[], angle: number): string | null {
    const moving = this.phase === "down" || angle < this.top - START_FRAC * this.range;
    const side = this.preset.preferredSide;
    const codes = detectFaults(this.preset, lm).map((f) => f.code)
      .filter((c) => !REP_LEVEL_CODES.has(c) && !REPLACED_CODES.has(c));

    // BACK_ARCH no aplica con el torso casi horizontal (banco, hip thrust...)
    const sh = lm[side === "L" ? PoseLandmark.LEFT_SHOULDER : PoseLandmark.RIGHT_SHOULDER];
    const hp = lm[side === "L" ? PoseLandmark.LEFT_HIP : PoseLandmark.RIGHT_HIP];
    const horizontalTorso = sh && hp ? torsoInclination(sh, hp) > 60 : false;
    const filtered = codes.filter((c) => !(horizontalTorso && c.endsWith("BACK_ARCH")));
    if (filtered.length > 0) return faultMessage(filtered[0]).message;

    // Valgo de rodilla: solo de frente y en la bajada.
    const hasValgusRule = this.preset.faults.length > 0 && /squat|lunge|leg_press|split/.test(this.preset.id);
    if (hasValgusRule && moving && this.isFrontal(lm)) {
      const lk = lm[PoseLandmark.LEFT_KNEE], rk = lm[PoseLandmark.RIGHT_KNEE];
      const la = lm[PoseLandmark.LEFT_ANKLE], ra = lm[PoseLandmark.RIGHT_ANKLE];
      if (lk && rk && la && ra) {
        const kneeGap = Math.abs(lk.x - rk.x);
        const ankleGap = Math.abs(la.x - ra.x);
        if (ankleGap > 0.05 && kneeGap < ankleGap * 0.75) return faultMessage("KNEE_VALGUS").message;
      }
    }
    return null;
  }

  /** ¿La persona está de frente? (hombros muy separados respecto al torso) */
  private isFrontal(lm: Landmark[]): boolean {
    const ls = lm[PoseLandmark.LEFT_SHOULDER], rs = lm[PoseLandmark.RIGHT_SHOULDER];
    const lh = lm[PoseLandmark.LEFT_HIP];
    if (!ls || !rs || !lh) return false;
    const shoulderW = Math.abs(ls.x - rs.x);
    const torsoH = Math.abs(lh.y - ls.y);
    return torsoH > 0 && shoulderW / torsoH > 0.6;
  }

  private applyHysteresis(next: FormState) {
    if (next === this.candidate) this.candidateN++;
    else { this.candidate = next; this.candidateN = 1; }
    const need = next === "bad" ? BAD_AFTER_FRAMES : GOOD_AFTER_FRAMES;
    if (this.candidateN >= need) this.state = next;
  }

  private lose(): LiveSnapshot {
    this.lostN++;
    if (this.lostN >= LOST_AFTER_FRAMES) {
      this.state = "unknown"; this.candidate = "unknown"; this.candidateN = 0;
      this.phase = "up"; this.minAngle = 180; this.angleS = null;
    }
    return {
      count: this.count, partialCount: this.partial, angle: this.angleS ?? 0, phase: this.phase,
      formState: this.state, message: null,
      bodyVisible: this.lostN < LOST_AFTER_FRAMES, supportsReps: this.supportsReps
    };
  }
}
