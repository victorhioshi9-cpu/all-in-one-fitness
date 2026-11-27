/**
 * repStateMachine.ts
 * ----------------------------------------------------------------------------
 * Máquina de estados de repetición.
 *
 * Estados:
 *   IDLE -> ECCENTRIC -> BOTTOM_CONTRACTED -> CONCENTRIC -> TOP_LOCKED -> COUNTED
 *
 * Cada transición registra timestamps para calcular:
 *   - tempo (segundos de bajada vs subida)
 *   - ROM (ángulo mínimo alcanzado = profundidad)
 *   - rep completa (alcanzó el umbral de profundidad Y volvió al umbral de extensión)
 *
 * Diseñada para ser puramente funcional con un estado mutable interno: 1
 * instancia por ejercicio en marcha. Llamada por cada frame.
 */
import { angle2D } from "./angleUtils";
import type { Landmark } from "./landmarks";

export type RepPhase =
  | "IDLE"
  | "ECCENTRIC"      // bajada
  | "BOTTOM_CONTRACTED"
  | "CONCENTRIC"     // subida
  | "TOP_LOCKED";    // ya volvió a la posición inicial

export interface RepSummary {
  repIndex: number;
  completed: boolean;
  fullRom: boolean;
  eccentricMs: number;
  pauseMs: number;
  concentricMs: number;
  romDegrees: number;          // ángulo mínimo alcanzado
  startAngle: number;
  endAngle: number;
  faults: string[];
  timestampMs: number;
}

export interface RepStateMachineConfig {
  /** Landmarks del trípode (vértice = articulación principal). Ej: [hip, knee, ankle] */
  triplet: [number, number, number];
  /**
   * Ángulo de "arriba" (extensión completa). Para sentadilla sería ~170°,
   * para curl con barra Z sería ~160° (codo casi extendido).
   */
  topAngleDeg: number;
  /** Ángulo de "abajo" (contracción/flexión máxima esperada). */
  bottomAngleDeg: number;
  /**
   * Margen de histéresis en grados para evitar rebotes.
   * La transición a ECCENTRIC se dispara cuando el ángulo baja de
   * `topAngleDeg - hysteresis`; a CONCENTRIC cuando sube de
   * `bottomAngleDeg + hysteresis`.
   */
  hysteresisDeg: number;
  /** Tiempo mínimo de pausa en el BOTTOM para contar como "pause rep". */
  pauseMsThreshold: number;
  /** Si la ROM no alcanzó `bottomAngleDeg + romToleranceDeg`, es media rep. */
  romToleranceDeg: number;
}

export class RepStateMachine {
  private phase: RepPhase = "IDLE";
  private repCount = 0;
  private currentRepStart: number = 0;
  private eccentricStart: number = 0;
  private bottomEnterTime: number = 0;
  private concentricStart: number = 0;
  private lastAngle: number = 0;
  private minAngleDuringRep: number = 180;
  private startAngle: number = 0;
  private faultsThisRep: string[] = [];
  private repHistory: RepSummary[] = [];

  constructor(private cfg: RepStateMachineConfig) {}

  reset(): void {
    this.phase = "IDLE";
    this.repCount = 0;
    this.repHistory = [];
    this.faultsThisRep = [];
    this.minAngleDuringRep = 180;
  }

  getPhase(): RepPhase { return this.phase; }
  getCount(): number { return this.repCount; }
  getHistory(): RepSummary[] { return this.repHistory; }
  getMinAngle(): number { return this.minAngleDuringRep; }

  /**
   * Procesa un frame de landmarks y devuelve, si procede, un RepSummary.
   * @param landmarks array de 33 landmarks
   * @param timestampMs timestamp del frame
   * @returns RepSummary si se completó una repetición, null en caso contrario
   */
  process(landmarks: Landmark[], timestampMs: number): RepSummary | null {
    const [aIdx, bIdx, cIdx] = this.cfg.triplet;
    const a = landmarks[aIdx];
    const b = landmarks[bIdx];
    const c = landmarks[cIdx];

    if (!a || !b || !c) return null;
    if ((a.v ?? a.p) < 0.5 || (b.v ?? b.p) < 0.5 || (c.v ?? c.p) < 0.5) return null;

    const angle = angle2D(a, b, c);
    const { topAngleDeg, bottomAngleDeg, hysteresisDeg, pauseMsThreshold, romToleranceDeg } = this.cfg;

    let completedRep: RepSummary | null = null;

    switch (this.phase) {
      case "IDLE":
        if (angle < topAngleDeg - hysteresisDeg) {
          this.phase = "ECCENTRIC";
          this.eccentricStart = timestampMs;
          this.currentRepStart = timestampMs;
          this.startAngle = angle;
          this.minAngleDuringRep = angle;
          this.faultsThisRep = [];
        }
        break;

      case "ECCENTRIC":
        this.minAngleDuringRep = Math.min(this.minAngleDuringRep, angle);
        if (angle <= bottomAngleDeg + hysteresisDeg) {
          this.phase = "BOTTOM_CONTRACTED";
          this.bottomEnterTime = timestampMs;
        }
        break;

      case "BOTTOM_CONTRACTED":
        this.minAngleDuringRep = Math.min(this.minAngleDuringRep, angle);
        if (angle > bottomAngleDeg + hysteresisDeg) {
          this.phase = "CONCENTRIC";
          this.concentricStart = timestampMs;
        }
        break;

      case "CONCENTRIC":
        if (angle >= topAngleDeg - hysteresisDeg) {
          // Repetición contada
          this.repCount++;
          const fullRom = this.minAngleDuringRep <= bottomAngleDeg + romToleranceDeg;
          const pauseMs = Math.max(0, this.concentricStart - this.bottomEnterTime);
          const eccentricMs = this.bottomEnterTime - this.eccentricStart;
          const concentricMs = timestampMs - this.concentricStart;

          completedRep = {
            repIndex: this.repCount,
            completed: true,
            fullRom,
            eccentricMs,
            pauseMs: pauseMs >= pauseMsThreshold ? pauseMs : 0,
            concentricMs,
            romDegrees: this.minAngleDuringRep,
            startAngle: this.startAngle,
            endAngle: angle,
            faults: [...this.faultsThisRep],
            timestampMs
          };
          this.repHistory.push(completedRep);
          this.phase = "TOP_LOCKED";
        }
        break;

      case "TOP_LOCKED":
        if (angle < topAngleDeg - hysteresisDeg) {
          // Empieza nueva rep sin pasar por IDLE (encadenado)
          this.phase = "ECCENTRIC";
          this.eccentricStart = timestampMs;
          this.currentRepStart = timestampMs;
          this.startAngle = angle;
          this.minAngleDuringRep = angle;
          this.faultsThisRep = [];
        }
        break;
    }

    this.lastAngle = angle;
    return completedRep;
  }

  /** Marca un fallo biomecánico en la rep en curso (lo acumula faults[]). */
  recordFault(code: string): void {
    if (this.phase !== "IDLE" && !this.faultsThisRep.includes(code)) {
      this.faultsThisRep.push(code);
    }
  }

  /** Cancela la rep en curso (sin contarla) - útil si el usuario abandona. */
  discardCurrent(): void {
    this.phase = "IDLE";
    this.faultsThisRep = [];
    this.minAngleDuringRep = 180;
  }

  /** Ángulo actual (suavizado externamente si procede). */
  getCurrentAngle(): number { return this.lastAngle; }
}
