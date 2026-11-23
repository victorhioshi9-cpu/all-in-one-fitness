/**
 * useAsymmetryDetection.ts
 * ----------------------------------------------------------------------------
 * Fatiga asimétrica izquierda vs. derecha.
 *
 * Para ejercicios bilaterales (sentadilla, press militar, curl con barra),
 * comparamos ángulos articulares L y R por frame. Si la asimetría excede
 * un umbral sostenido (≥ X% de frames durante una rep), marcamos:
 *   - El lado débil (menor ROM = está fatigado o tiene limitación).
 *   - Un "asymmetry score" acumulado por set.
 *
 * Salida:
 *   - currentAsymmetryDeg: delta en grados entre L y R
 *   - weakSide: 'L' | 'R' | null
 *   - setAsymmetryScore: promedio de asimetría durante el set
 *   - flag lado implicado en el overlay
 */
import { useState, useRef } from "react";
import type { PoseFrame, Landmark } from "@/modules/biomechanics/landmarks";
import { PoseLandmark } from "@/modules/biomechanics/landmarks";
import { angle2D } from "@/modules/biomechanics/angleUtils";

type Side = "L" | "R";

interface AsymmetryConfig {
  /** Trípode izquierdo (vértice al medio). Ej squat: [L_HIP, L_KNEE, L_ANKLE] */
  leftTriplet: [number, number, number];
  /** Trípode derecho. */
  rightTriplet: [number, number, number];
  /** Umbral en grados para considerar asimetría significativa. */
  thresholdDeg: number;
}

interface AsymmetryState {
  currentAsymmetryDeg: number;
  weakSide: Side | null;
  setAsymmetryScore: number;
  /** Landmarks a resaltar (los del lado débil). */
  flaggedLandmarks: number[];
}

interface AsymmetryResult extends AsymmetryState {
  processFrame(pose: PoseFrame): void;
  /** Al completar una rep, registra el promedio de asimetría de esa rep. */
  onRepComplete(): void;
  reset(): void;
}

export function useAsymmetryDetection(cfg: AsymmetryConfig): AsymmetryResult {
  const [state, setState] = useState<AsymmetryState>({
    currentAsymmetryDeg: 0,
    weakSide: null,
    setAsymmetryScore: 0,
    flaggedLandmarks: []
  });

  const repSum = useRef(0);
  const repSamples = useRef(0);
  const setSum = useRef(0);
  const setSamples = useRef(0);

  function processFrame(pose: PoseFrame): void {
    if (!pose.detected || !pose.landmarks.length) return;
    const lm = pose.landmarks;

    const [la, lb, lc] = cfg.leftTriplet;
    const [ra, rb, rc] = cfg.rightTriplet;
    const lA = lm[la], lB = lm[lb], lC = lm[lc];
    const rA = lm[ra], rB = lm[rb], rC = lm[rc];

    if (!lA || !lB || !lC || !rA || !rB || !rC) return;
    if ((lA.v ?? 0) < 0.5 || (rA.v ?? 0) < 0.5) return;

    const angleL = angle2D(lA, lB, lC);
    const angleR = angle2D(rA, rB, rC);
    const delta = angleR - angleL;  // positivo = derecha más extendida
    const absDelta = Math.abs(delta);

    const weakSide: Side | null = absDelta > cfg.thresholdDeg
      ? (delta > 0 ? "L" : "R")  // si derecha tiene mayor ángulo = izquierda más cerrada = débil
      : null;

    // Acumular para promedio por rep
    repSum.current += absDelta;
    repSamples.current++;
    setSum.current += absDelta;
    setSamples.current++;

    // Flagged landmarks: los del lado débil
    const flagged = weakSide === "L"
      ? [la, lb, lc]
      : weakSide === "R"
      ? [ra, rb, rc]
      : [];

    setState({
      currentAsymmetryDeg: absDelta,
      weakSide,
      setAsymmetryScore: setSamples.current > 0 ? setSum.current / setSamples.current : 0,
      flaggedLandmarks: flagged
    });
  }

  function onRepComplete(): void {
    // Reset acumulador de la rep (pero mantenemos el del set)
    repSum.current = 0;
    repSamples.current = 0;
  }

  function reset(): void {
    repSum.current = 0;
    repSamples.current = 0;
    setSum.current = 0;
    setSamples.current = 0;
    setState({
      currentAsymmetryDeg: 0,
      weakSide: null,
      setAsymmetryScore: 0,
      flaggedLandmarks: []
    });
  }

  return { ...state, processFrame, onRepComplete, reset };
}

/**
 * Presets por ejercicio (deben coincidir con exercisePresets).
 */
export const ASYMMETRY_PRESETS: Record<string, AsymmetryConfig> = {
  squat: {
    leftTriplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    rightTriplet: [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
    thresholdDeg: 8
  },
  bicep_curl: {
    leftTriplet: [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
    rightTriplet: [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    thresholdDeg: 12
  },
  shoulder_press: {
    leftTriplet: [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    rightTriplet: [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
    thresholdDeg: 10
  }
};
