/**
 * liveFormEngine.ts
 * ----------------------------------------------------------------------------
 * Motor en vivo del Coach: a partir de la pose de ML Kit (formato plano que
 * entrega usePoseDetection) hace TRES cosas para el ejercicio seleccionado:
 *
 *   1) Cuenta repeticiones usando el ángulo articular del preset (rodilla en
 *      sentadilla, codo en curl, etc.) con umbrales relativos al rango de
 *      movimiento (ROM).
 *
 *      v0.3.7 — CONTEO ESTRICTO (antes cualquier movimiento aleatorio contaba):
 *        a) Hay que estar ARMADO: cuerpo completo visible y quieto en la
 *           posición inicial durante un momento antes de que cuente nada.
 *        b) La rep solo cuenta si llega al ≥ 70 % del recorrido (ROM).
 *           Entre 40 % y 70 % es "rep parcial": se avisa pero NO suma.
 *        c) Duración mínima total y mínima de cada fase (bajada/subida), y
 *           velocidad angular máxima (descarta manotazos y saltos del detector).
 *        d) Sin "temblores": se rechaza el recorrido con demasiados cambios
 *           de sentido (movimiento errático, no una repetición).
 *        e) Si se pierde el cuerpo a mitad de rep, la rep se anula.
 *        f) Tras una rep rechazada hay que volver a quedarse quieto arriba.
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
  /**
   * true cuando el usuario ya está en posición inicial y quieto: solo entonces
   * se cuentan repeticiones. false = "colócate y quédate quieto".
   */
  armed: boolean;
}

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  count: 0, partialCount: 0, angle: 0, phase: "up",
  formState: "unknown", message: null, bodyVisible: false, supportsReps: true, armed: false
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
const START_FRAC = 0.25;     // empieza el movimiento al recorrer 25% del ROM
const COUNT_FRAC = 0.7;      // SOLO cuenta si llegó al 70% del ROM (antes 40%)
const PARTIAL_FRAC = 0.4;    // entre 40% y 70%: se avisa como parcial, no suma
const RETURN_FRAC = 0.15;    // vuelve a "arriba" a menos del 15% del ROM
const MIN_RANGE_DEG = 25;    // por debajo: ejercicio isométrico, sin conteo
const MIN_REP_GAP_MS = 500;  // anti doble conteo
const MIN_REP_MS = 900;      // bajada + subida como mínimo
const MIN_PHASE_MS = 250;    // cada fase (bajar / subir) como mínimo
const MAX_REP_MS = 15000;    // si tarda más, se anula (el usuario se paró/abandonó)
const MAX_ANGULAR_SPEED = 600; // °/s sobre el ángulo suavizado (manotazos / saltos)
const MAX_REVERSALS = 3;     // cambios de sentido de ≥ REVERSAL_DEG dentro de una rep
const REVERSAL_DEG = 10;
const ARM_HOLD_MS = 700;     // quieto arriba para armar (inicio de serie)
const REARM_HOLD_MS = 300;   // tras una rep rechazada
const ARM_TOP_FRAC = 0.12;   // "arriba" = dentro del 12% superior del ROM
const ARM_MAX_SPEED = 60;    // °/s: lo que se considera "quieto"
const ABORT_LOST_FRAMES = 5; // cuerpo perdido a mitad de rep → anula la rep
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

  // --- validación estricta de repeticiones ---
  private armed = false;
  private armSince = 0;          // ms desde que está quieto arriba (0 = no)
  private holdNeedMs = ARM_HOLD_MS;
  private prevAngle: number | null = null;
  private prevTs = 0;
  private speed = 0;             // °/s (valor absoluto, suavizado)
  private repStartTs = 0;
  private bottomTs = 0;          // instante en que alcanzó el mínimo
  private maxSpeedInRep = 0;
  private reversals = 0;
  private dirSign = 0;           // -1 bajando, +1 subiendo
  private extremeAngle = 180;    // último extremo para medir cambios de sentido
  private unknownFrames = 0;     // frames de la rep sin cuerpo completo
  private repFrames = 0;

  private state: FormState = "unknown";
  private candidate: FormState = "unknown";
  private candidateN = 0;
  private lostN = 0;
  private lastMessage: string | null = null;

  private readonly top: number;
  private readonly bottom: number;
  private readonly range: number;
  private readonly reversalDeg: number;
  readonly supportsReps: boolean;

  constructor(private preset: ExercisePreset) {
    this.top = preset.stateMachine.topAngleDeg;
    this.bottom = preset.stateMachine.bottomAngleDeg;
    this.range = this.top - this.bottom;
    this.supportsReps = this.range >= MIN_RANGE_DEG;
    // En ejercicios de poco recorrido el umbral de "cambio de sentido" se reduce.
    this.reversalDeg = Math.max(6, Math.min(REVERSAL_DEG, this.range * 0.12));
  }

  setCount(n: number) { this.count = Math.max(0, n); }
  reset() {
    this.count = 0; this.partial = 0; this.phase = "up"; this.minAngle = 180; this.angleS = null; this.notice = null;
    this.disarm(ARM_HOLD_MS);
    this.prevAngle = null; this.prevTs = 0; this.speed = 0;
  }

  /** Congela/descongela el motor (descanso): al reanudar hay que volver a armarse. */
  resume() { this.disarm(ARM_HOLD_MS); this.angleS = null; this.prevAngle = null; this.prevTs = 0; this.phase = "up"; this.minAngle = 180; }

  private disarm(holdMs: number) {
    this.armed = false; this.armSince = 0; this.holdNeedMs = holdMs;
  }

  private resetRepTracking() {
    this.repStartTs = 0; this.bottomTs = 0; this.maxSpeedInRep = 0;
    this.reversals = 0; this.dirSign = 0; this.extremeAngle = 180;
    this.unknownFrames = 0; this.repFrames = 0;
  }

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

    // Cuerpo "suficientemente completo": tronco presente y segmentos con tamaño
    // razonable (si la persona está muy lejos/recortada el ángulo es ruido).
    const fullBody = this.bodyIsUsable(lm, t as [Landmark, Landmark, Landmark]);
    this.updateSpeed(angle, nowMs);

    if (this.supportsReps) this.stepCounter(angle, nowMs, fullBody);

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
      supportsReps: this.supportsReps,
      armed: this.armed
    };
  }

  // ------------------------------------------------------------------------
  /** Tronco (hombro + cadera) presente y segmentos del trípode no degenerados. */
  private bodyIsUsable(lm: Landmark[], t: [Landmark, Landmark, Landmark]): boolean {
    const hasShoulder = !!(lm[PoseLandmark.LEFT_SHOULDER] || lm[PoseLandmark.RIGHT_SHOULDER]);
    const hasHip = !!(lm[PoseLandmark.LEFT_HIP] || lm[PoseLandmark.RIGHT_HIP]);
    if (!hasShoulder || !hasHip) return false;
    const seg1 = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
    const seg2 = Math.hypot(t[2].x - t[1].x, t[2].y - t[1].y);
    return seg1 > 0.04 && seg2 > 0.04;
  }

  /** Velocidad angular suavizada (°/s). */
  private updateSpeed(angle: number, now: number) {
    if (this.prevAngle !== null && this.prevTs > 0 && now - this.prevTs >= 20) {
      const dt = (now - this.prevTs) / 1000;
      const inst = Math.abs(angle - this.prevAngle) / dt;
      this.speed = this.speed * 0.5 + inst * 0.5;
      this.prevAngle = angle;
      this.prevTs = now;
    } else if (this.prevAngle === null) {
      this.prevAngle = angle;
      this.prevTs = now;
      this.speed = 0;
    }
  }

  /** Cuenta cambios de sentido de ≥ reversalDeg (zig-zag = movimiento errático). */
  private trackReversal(angle: number) {
    if (this.dirSign === 0) { this.dirSign = -1; this.extremeAngle = angle; return; }
    if (this.dirSign === -1) {
      if (angle < this.extremeAngle) this.extremeAngle = angle;
      else if (angle - this.extremeAngle >= this.reversalDeg) { this.dirSign = 1; this.extremeAngle = angle; this.reversals++; }
    } else {
      if (angle > this.extremeAngle) this.extremeAngle = angle;
      else if (this.extremeAngle - angle >= this.reversalDeg) { this.dirSign = -1; this.extremeAngle = angle; this.reversals++; }
    }
  }

  private stepCounter(angle: number, now: number, fullBody: boolean) {
    const downAt = this.top - START_FRAC * this.range;
    const armZone = this.top - ARM_TOP_FRAC * this.range;

    if (this.phase === "up") {
      // ---- 1) ARMAR: cuerpo completo, arriba y QUIETO durante un momento ----
      if (!this.armed) {
        const atTop = fullBody && angle >= armZone && this.speed <= ARM_MAX_SPEED;
        if (!atTop) { this.armSince = 0; return; }
        if (this.armSince === 0) { this.armSince = now; return; }
        if (now - this.armSince >= this.holdNeedMs) { this.armed = true; this.armSince = 0; }
        return;
      }
      // Si estando armado se pierde el cuerpo "usable", se desarma.
      if (!fullBody) { this.disarm(ARM_HOLD_MS); return; }

      // ---- 2) Empieza la bajada ----
      if (angle < downAt) {
        this.phase = "down";
        this.minAngle = angle;
        this.resetRepTracking();
        this.repStartTs = now;
        this.bottomTs = now;
        this.trackReversal(angle);
      }
      return;
    }

    // ---- fase "down": rep en curso ----
    this.repFrames++;
    if (!fullBody) this.unknownFrames++;
    this.maxSpeedInRep = Math.max(this.maxSpeedInRep, this.speed);
    this.trackReversal(angle);
    if (angle < this.minAngle) { this.minAngle = angle; this.bottomTs = now; }

    if (now - this.repStartTs > MAX_REP_MS) {
      this.abortRep();
      return;
    }

    const upAt = this.top - RETURN_FRAC * this.range;
    if (angle > upAt) this.finishRep(now);
  }

  /** Valida la rep al volver arriba. Solo suma si pasa TODOS los filtros. */
  private finishRep(now: number) {
    const countAt = this.top - COUNT_FRAC * this.range;
    const partialAt = this.top - PARTIAL_FRAC * this.range;
    const total = now - this.repStartTs;
    const descMs = this.bottomTs - this.repStartTs;
    const ascMs = now - this.bottomTs;

    let reject: { notice: string | null; disarm: boolean } | null = null;
    if (this.minAngle > partialAt) {
      reject = { notice: null, disarm: false };                                   // meneo pequeño: se ignora
    } else if (this.minAngle > countAt) {
      reject = { notice: "No contó: recorre más el movimiento", disarm: true };   // 40–70 % del ROM
    } else if (total < MIN_REP_MS || descMs < MIN_PHASE_MS || ascMs < MIN_PHASE_MS) {
      reject = { notice: "No contó: muy rápido, controla el movimiento", disarm: true };
    } else if (this.maxSpeedInRep > MAX_ANGULAR_SPEED) {
      reject = { notice: "No contó: movimiento brusco", disarm: true };
    } else if (this.reversals > MAX_REVERSALS) {
      reject = { notice: "No contó: movimiento irregular", disarm: true };
    } else if (this.repFrames > 0 && this.unknownFrames / this.repFrames > 0.3) {
      reject = { notice: "No contó: no se ve tu cuerpo completo", disarm: true };
    }

    if (reject) {
      if (reject.notice) this.notice = { text: reject.notice, until: now + NOTICE_MS };
      if (reject.disarm) this.disarm(REARM_HOLD_MS);
    } else {
      this.count++;
      this.lastCountTs = now;
      const full = this.minAngle <= this.bottom + this.preset.stateMachine.romToleranceDeg;
      if (!full) {
        this.partial++;
        this.notice = { text: "Rep parcial: baja un poco más", until: now + NOTICE_MS };
      }
    }
    this.phase = "up";
    this.minAngle = 180;
    this.resetRepTracking();
  }

  /** Anula la rep en curso sin contarla (cuerpo perdido, rep eterna…). */
  private abortRep() {
    this.phase = "up";
    this.minAngle = 180;
    this.resetRepTracking();
    this.disarm(ARM_HOLD_MS);
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
    // Cuerpo perdido a mitad de rep → rep anulada (antes seguía "viva" 15 frames).
    if (this.phase === "down" && this.lostN >= ABORT_LOST_FRAMES) this.abortRep();
    if (this.lostN >= LOST_AFTER_FRAMES) {
      this.state = "unknown"; this.candidate = "unknown"; this.candidateN = 0;
      this.phase = "up"; this.minAngle = 180; this.angleS = null;
      this.prevAngle = null; this.prevTs = 0; this.speed = 0;
      this.resetRepTracking();
      this.disarm(ARM_HOLD_MS);
    }
    return {
      count: this.count, partialCount: this.partial, angle: this.angleS ?? 0, phase: this.phase,
      formState: this.state, message: null,
      bodyVisible: this.lostN < LOST_AFTER_FRAMES, supportsReps: this.supportsReps,
      armed: this.armed
    };
  }
}
