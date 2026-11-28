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
 *
 *      v0.5.1 — CONTEO ADAPTATIVO (el estricto v0.3.7 no contaba en la práctica):
 *        - El "arriba" se CALIBRA con tu postura real (antes era un ángulo fijo
 *          del preset: si tu rodilla/codo no llegaba a 170°/160° nunca se armaba).
 *        - Armar = estar arriba con el ángulo ESTABLE (rango pequeño), no con
 *          velocidad instantánea (el ruido del detector la disparaba).
 *        - Se calculan los dos lados del cuerpo y se usa el que trabaja/se ve
 *          mejor (antes siempre el lado del preset, aunque quedara tapado).
 *        - Si llevas >1 s moviéndote y ya estabas arriba, se auto-calibra.
 *        - La rep sigue exigiendo ROM, duración, suavidad y sin zig-zag.
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
  /** "Arriba" calibrado (°) y ángulo al que hay que bajar para que cuente (°). */
  topDeg: number;
  countAtDeg: number;
}

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  count: 0, partialCount: 0, angle: 0, phase: "up",
  formState: "unknown", message: null, bodyVisible: false, supportsReps: true, armed: false,
  topDeg: 0, countAtDeg: 0
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
const ARM_HOLD_MS = 450;     // estable arriba para armar (inicio de serie)
const REARM_HOLD_MS = 250;   // tras una rep rechazada
const ARM_STILL_RANGE = 12;  // ° máx. de variación del ángulo suavizado mientras se arma
const CALIB_FRAC = 0.5;      // "arriba" válido: al menos a 50% del ROM del preset (desde el tope)
const TOP_MAX_OVER = 8;      // el "arriba" calibrado no pasa del preset + 8°
const MIN_EFF_RANGE_FRAC = 0.55; // el ROM efectivo nunca baja de 55% del ROM del preset
const SIDE_SWITCH_RATIO = 1.6;   // un lado se usa si se mueve 1.6x más que el otro
const SIDE_SWITCH_MIN = 8;       // …y al menos 8° más de amplitud
const SIDE_WINDOW_MS = 3000;
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

type Tri = [Landmark, Landmark, Landmark];
interface Sample { t: number; a: number }

export class LiveFormEngine {
  private angleS: number | null = null;     // ángulo suavizado del lado ACTIVO
  private angP: number | null = null;       // lado del preset (suavizado)
  private angM: number | null = null;       // lado contrario (suavizado)
  private winP: Sample[] = [];
  private winM: Sample[] = [];
  private useMirror = false;
  private phase: "up" | "down" = "up";
  private minAngle = 180;
  private count = 0;
  private partial = 0;
  private lastCountTs = 0;
  private notice: { text: string; until: number } | null = null;

  // --- calibración del "arriba" de ESTA persona ---
  private topRef: number;
  private holdMin = 999;
  private holdMax = -999;
  private holdSum = 0;
  private holdN = 0;

  // --- validación estricta de repeticiones ---
  private armed = false;
  private armSince = 0;          // ms desde que está estable arriba (0 = no)
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

  private readonly presetTop: number;
  private readonly bottom: number;
  private readonly presetRange: number;
  private readonly reversalDeg: number;
  readonly supportsReps: boolean;

  constructor(private preset: ExercisePreset) {
    this.presetTop = preset.stateMachine.topAngleDeg;
    this.topRef = this.presetTop;
    this.bottom = preset.stateMachine.bottomAngleDeg;
    this.presetRange = this.presetTop - this.bottom;
    this.supportsReps = this.presetRange >= MIN_RANGE_DEG;
    // En ejercicios de poco recorrido el umbral de "cambio de sentido" se reduce.
    this.reversalDeg = Math.max(6, Math.min(REVERSAL_DEG, this.presetRange * 0.12));
  }

  /** ROM efectivo con el "arriba" calibrado de la persona. */
  private get range(): number {
    return Math.max(this.presetRange * MIN_EFF_RANGE_FRAC, this.topRef - this.bottom);
  }

  setCount(n: number) { this.count = Math.max(0, n); }
  reset() {
    this.count = 0; this.partial = 0; this.phase = "up"; this.minAngle = 180; this.angleS = null; this.notice = null;
    this.topRef = this.presetTop;
    this.angP = null; this.angM = null; this.winP = []; this.winM = []; this.useMirror = false;
    this.disarm(ARM_HOLD_MS);
    this.prevAngle = null; this.prevTs = 0; this.speed = 0;
  }

  /** Congela/descongela el motor (descanso): al reanudar hay que volver a armarse. */
  resume() {
    this.disarm(ARM_HOLD_MS); this.angleS = null; this.angP = null; this.angM = null;
    this.winP = []; this.winM = [];
    this.prevAngle = null; this.prevTs = 0; this.phase = "up"; this.minAngle = 180;
  }

  private disarm(holdMs: number) {
    this.armed = false; this.armSince = 0; this.holdNeedMs = holdMs;
    this.holdMin = 999; this.holdMax = -999; this.holdSum = 0; this.holdN = 0;
  }

  private resetRepTracking() {
    this.repStartTs = 0; this.bottomTs = 0; this.maxSpeedInRep = 0;
    this.reversals = 0; this.dirSign = 0; this.extremeAngle = 180;
    this.unknownFrames = 0; this.repFrames = 0;
  }

  /** Trípode completo (los 3 puntos presentes) o null. */
  private tri(lm: Landmark[], a: number, b: number, c: number): Tri | null {
    return lm[a] && lm[b] && lm[c] ? [lm[a], lm[b], lm[c]] : null;
  }

  private pushWin(win: Sample[], t: number, a: number) {
    win.push({ t, a });
    while (win.length > 0 && t - win[0].t > SIDE_WINDOW_MS) win.shift();
  }
  private amp(win: Sample[]): number {
    if (win.length < 4) return 0;
    let mn = 999, mx = -999;
    for (const s of win) { if (s.a < mn) mn = s.a; if (s.a > mx) mx = s.a; }
    return mx - mn;
  }

  /** Elige el lado que trabaja/se ve mejor (solo con la rep parada). */
  private chooseSide(): boolean {
    if (this.phase !== "up") return false;
    const aP = this.amp(this.winP), aM = this.amp(this.winM);
    const before = this.useMirror;
    if (!this.useMirror && this.angM !== null && aM > aP * SIDE_SWITCH_RATIO + SIDE_SWITCH_MIN) this.useMirror = true;
    else if (this.useMirror && this.angP !== null && aP > aM * SIDE_SWITCH_RATIO + SIDE_SWITCH_MIN) this.useMirror = false;
    // Si el lado elegido no tiene datos, usar el otro.
    if (this.useMirror && this.angM === null) this.useMirror = false;
    if (!this.useMirror && this.angP === null) this.useMirror = this.angM !== null;
    return before !== this.useMirror;
  }

  update(pose: Record<string, number> | null, nowMs: number): LiveSnapshot {
    if (!pose) return this.lose();
    const lm = flatPoseToLandmarks(pose);

    // --- ángulo de AMBOS lados (el del preset y el contrario) ---
    const [a0, b0, c0] = this.preset.stateMachine.triplet;
    const tP = this.tri(lm, a0, b0, c0);
    const tM = this.tri(lm, mirrorIdx(a0), mirrorIdx(b0), mirrorIdx(c0));
    if (!tP && !tM) return this.lose();

    this.lostN = 0;
    if (tP) {
      const raw = angle2D(tP[0], tP[1], tP[2]);
      this.angP = this.angP === null ? raw : smooth(this.angP, raw, 0.4);
      this.pushWin(this.winP, nowMs, this.angP);
    }
    if (tM) {
      const raw = angle2D(tM[0], tM[1], tM[2]);
      this.angM = this.angM === null ? raw : smooth(this.angM, raw, 0.4);
      this.pushWin(this.winM, nowMs, this.angM);
    }
    if (this.chooseSide()) {
      // Cambio de lado: se reinicia la medida de velocidad y se vuelve a calibrar.
      this.prevAngle = null; this.prevTs = 0; this.speed = 0;
      this.disarm(ARM_HOLD_MS);
    }
    const angle = (this.useMirror ? this.angM : this.angP) ?? (this.angP ?? this.angM)!;
    this.angleS = angle;
    const tUse = (this.useMirror ? (tM ?? tP) : (tP ?? tM)) as Tri;

    const fullBody = this.bodyIsUsable(lm, tUse);
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
      armed: this.armed,
      topDeg: this.topRef,
      countAtDeg: this.topRef - COUNT_FRAC * this.range
    };
  }

  // ------------------------------------------------------------------------
  /** Tronco (hombro + cadera) presente y segmentos del trípode no degenerados. */
  private bodyIsUsable(lm: Landmark[], t: Tri): boolean {
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
    if (this.phase === "up") {
      // ---- 1) ARMAR: cuerpo completo, "arriba" y ESTABLE; calibra tu "arriba" ----
      if (!this.armed) {
        const calibZone = this.presetTop - CALIB_FRAC * this.presetRange;
        if (!fullBody || angle < calibZone) { this.armSince = 0; return; }
        const restart = () => {
          this.armSince = now; this.holdMin = angle; this.holdMax = angle; this.holdSum = angle; this.holdN = 1;
        };
        if (this.armSince === 0) { restart(); return; }
        this.holdMin = Math.min(this.holdMin, angle);
        this.holdMax = Math.max(this.holdMax, angle);
        this.holdSum += angle; this.holdN++;
        if (this.holdMax - this.holdMin > ARM_STILL_RANGE) { restart(); return; }   // se mueve: empezar de nuevo
        if (now - this.armSince >= this.holdNeedMs && this.holdN >= 3) {
          const avg = this.holdSum / this.holdN;
          this.topRef = Math.max(calibZone, Math.min(this.presetTop + TOP_MAX_OVER, avg));
          this.armed = true; this.armSince = 0;
        }
        return;
      }
      // Si estando armado se pierde el cuerpo "usable", se desarma.
      if (!fullBody) { this.disarm(ARM_HOLD_MS); return; }

      // ---- 2) Empieza la bajada ----
      const downAt = this.topRef - START_FRAC * this.range;
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

    const upAt = this.topRef - RETURN_FRAC * this.range;
    if (angle > upAt) this.finishRep(now);
  }

  /** Valida la rep al volver arriba. Solo suma si pasa TODOS los filtros. */
  private finishRep(now: number) {
    const countAt = this.topRef - COUNT_FRAC * this.range;
    const partialAt = this.topRef - PARTIAL_FRAC * this.range;
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
    const moving = this.phase === "down" || angle < this.topRef - START_FRAC * this.range;
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
      this.angP = null; this.angM = null; this.winP = []; this.winM = [];
      this.prevAngle = null; this.prevTs = 0; this.speed = 0;
      this.resetRepTracking();
      this.disarm(ARM_HOLD_MS);
    }
    return {
      count: this.count, partialCount: this.partial, angle: this.angleS ?? 0, phase: this.phase,
      formState: this.state, message: null,
      bodyVisible: this.lostN < LOST_AFTER_FRAMES, supportsReps: this.supportsReps,
      armed: this.armed,
      topDeg: this.topRef,
      countAtDeg: this.topRef - COUNT_FRAC * this.range
    };
  }
}
