/**
 * useVbtVelocity.ts
 * ----------------------------------------------------------------------------
 * VBT (Velocity-Based Training) sin sensor externo.
 *
 * Estrategia:
 *   - El "load point" (muñeca, cadera o barra virtual) se sigue frame a frame.
 *   - Calcula la velocidad vertical (px/s) normalizada al ancho del frame.
 *   - Convierte a m/s estimando la altura del usuario en pixels (de landmark
 *     ankle a landmark head).
 *   - Por rep: pico de velocidad concéntrica = indicador de explosividad.
 *   - Velocidad media perdida entre rep1 y repN = indicador de fatiga.
 *
 * Salida:
 *   - currentVelocityMs (live)
 *   - lastRepPeakMs (velocidad pico de la última rep)
 *   - velocityLossPct (% pérdida entre rep1 y rep actual)
 *   - Si velocityLossPct > 20% → fatiga detectada (deload sugerido).
 */
import { useState, useRef } from "react";
import type { PoseFrame, Landmark } from "@/modules/biomechanics/landmarks";
import { PoseLandmark } from "@/modules/biomechanics/landmarks";

interface VbtConfig {
  /** Landmark del "load point": muñeca por defecto. */
  loadPointIdx: number;
  /** Anchor landmark para estimar la altura-usuario en pixels (cabeza-pies). */
  topAnchorIdx: number;     // e.g. LEFT_SHOULDER (más estable que nose)
  bottomAnchorIdx: number;  // e.g. LEFT_ANKLE
}

interface VbtState {
  currentVelocityMs: number;
  lastRepPeakMs: number;
  velocityLossPct: number;
  fatigueLevel: "fresh" | "moderate" | "fatigued";
  repPeaks: number[];        // historial de picos por rep
}

interface VbtResult extends VbtState {
  /** Procesa un nuevo frame; devuelve la métrica actualizada. */
  processFrame(pose: PoseFrame): void;
  /** Llamada cuando se completa una rep: registra el pico. */
  onRepComplete(peakMs: number): void;
  reset(): void;
}

export function useVbtVelocity(cfg: VbtConfig): VbtResult {
  const [state, setState] = useState<VbtState>({
    currentVelocityMs: 0,
    lastRepPeakMs: 0,
    velocityLossPct: 0,
    fatigueLevel: "fresh",
    repPeaks: []
  });

  const lastSample = useRef<{ ts: number; y: number } | null>(null);
  const currentRepPeak = useRef(0);
  const userHeightPx = useRef(0);

  function processFrame(pose: PoseFrame): void {
    if (!pose.detected || !pose.landmarks.length) {
      setState((s) => ({ ...s, currentVelocityMs: 0 }));
      return;
    }
    const lm = pose.landmarks;
    const load = lm[cfg.loadPointIdx];
    const topAnchor = lm[cfg.topAnchorIdx];
    const bottomAnchor = lm[cfg.bottomAnchorIdx];
    if (!load || !topAnchor || !bottomAnchor) return;

    // Estimar altura del usuario en pixels (estable a través del set)
    const h = Math.abs(topAnchor.y - bottomAnchor.y);
    if (h > 0.05) userHeightPx.current = h;

    // Convertir posición vertical normalizada a metros: asumimos altura = 1.7m
    // px_per_meter = userHeightPx / 1.7
    const pxPerMeter = userHeightPx.current / 1.7;

    if (lastSample.current) {
      const dt = (pose.timestampMs - lastSample.current.ts) / 1000;
      if (dt > 0 && dt < 0.5) {  // descartar saltos de tiempo
        const dyPx = (load.y - lastSample.current.y) * pxPerMeter;
        // Velocidad: positiva = subida (concéntrica); negativa = bajada
        const vMs = -dyPx / dt / 100; // normalización: load.y está en [0..1]
        // Suavizado exponencial
        const smoothed = state.currentVelocityMs * 0.6 + vMs * 0.4;
        const peakNow = Math.max(currentRepPeak.current, Math.abs(smoothed));
        currentRepPeak.current = peakNow;

        setState((s) => ({ ...s, currentVelocityMs: smoothed }));
      }
    }
    lastSample.current = { ts: pose.timestampMs, y: load.y };
  }

  function onRepComplete(peakMs: number): void {
    const peaks = [...state.repPeaks, peakMs];
    const firstPeak = peaks[0] || peakMs;
    const lossPct = firstPeak > 0
      ? Math.max(0, (firstPeak - peakMs) / firstPeak * 100)
      : 0;
    const fatigue: VbtState["fatigueLevel"] =
      lossPct > 30 ? "fatigued" :
      lossPct > 15 ? "moderate" : "fresh";
    setState({
      currentVelocityMs: 0,
      lastRepPeakMs: peakMs,
      velocityLossPct: lossPct,
      fatigueLevel: fatigue,
      repPeaks: peaks
    });
    currentRepPeak.current = 0;
  }

  function reset(): void {
    setState({
      currentVelocityMs: 0,
      lastRepPeakMs: 0,
      velocityLossPct: 0,
      fatigueLevel: "fresh",
      repPeaks: []
    });
    currentRepPeak.current = 0;
    lastSample.current = null;
  }

  return { ...state, processFrame, onRepComplete, reset };
}

/**
 * Preset por ejercicio: qué landmark seguir como "load point".
 */
export function getLoadPointForExercise(exerciseId: string): VbtConfig {
  switch (exerciseId) {
    case "squat":
      return {
        loadPointIdx: PoseLandmark.LEFT_HIP,    // la cadera sube/baja con la barra
        topAnchorIdx: PoseLandmark.LEFT_SHOULDER,
        bottomAnchorIdx: PoseLandmark.LEFT_ANKLE
      };
    case "bicep_curl":
      return {
        loadPointIdx: PoseLandmark.RIGHT_WRIST,  // la muñeca sube con la barra
        topAnchorIdx: PoseLandmark.RIGHT_SHOULDER,
        bottomAnchorIdx: PoseLandmark.RIGHT_HIP
      };
    case "shoulder_press":
      return {
        loadPointIdx: PoseLandmark.LEFT_WRIST,
        topAnchorIdx: PoseLandmark.LEFT_SHOULDER,
        bottomAnchorIdx: PoseLandmark.LEFT_HIP
      };
    default:
      return {
        loadPointIdx: PoseLandmark.LEFT_WRIST,
        topAnchorIdx: PoseLandmark.LEFT_SHOULDER,
        bottomAnchorIdx: PoseLandmark.LEFT_HIP
      };
  }
}
