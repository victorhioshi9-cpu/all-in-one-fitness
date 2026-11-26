/**
 * usePoseDetection.ts
 * ----------------------------------------------------------------------------
 * Hook que usa el plugin nativo 'detectPose' del paquete
 * @scottjgilroy/react-native-vision-camera-v4-pose-detection (Google ML Kit).
 *
 * A diferencia del wrapper Camera del paquete (que usa useRunOnJS que no existe
 * en worklets-core 0.4.0), este hook usa useRunInJS directamente.
 *
 * El plugin nativo ya está instalado y autolinkado. Solo necesitamos llamarlo.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useRunInJS } from "react-native-worklets-core";
import { VisionCameraProxy } from "react-native-vision-camera";

// Inicializar el plugin nativo una sola vez.
// Si el paquete no está autolinkado, plugin será null y devolvemos null.
let detectPosePlugin: any = null;
try {
  detectPosePlugin = VisionCameraProxy.initFrameProcessorPlugin("detectPose", {});
} catch (e) {
  console.warn("[usePoseDetection] No se pudo inicializar plugin detectPose:", e);
}

export interface PoseLandmark {
  x: number;
  y: number;
}

export interface PoseData {
  // Landmarks principales (todos opcionales, ML Kit puede no detectar todos)
  leftShoulder?: PoseLandmark;
  rightShoulder?: PoseLandmark;
  leftElbow?: PoseLandmark;
  rightElbow?: PoseLandmark;
  leftWrist?: PoseLandmark;
  rightWrist?: PoseLandmark;
  leftHip?: PoseLandmark;
  rightHip?: PoseLandmark;
  leftKnee?: PoseLandmark;
  rightKnee?: PoseLandmark;
  leftAnkle?: PoseLandmark;
  rightAnkle?: PoseLandmark;
  nose?: PoseLandmark;
  leftEar?: PoseLandmark;
  rightEar?: PoseLandmark;
  leftEye?: PoseLandmark;
  rightEye?: PoseLandmark;
  leftMouth?: PoseLandmark;
  rightMouth?: PoseLandmark;
  [key: string]: PoseLandmark | undefined;
}

export interface UsePoseDetectionResult {
  pose: PoseData | null;
  fps: number;
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
  isAvailable: boolean;
}

export function usePoseDetection(active: boolean): UsePoseDetectionResult {
  const [pose, setPose] = useState<PoseData | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);
  const isAvailable = detectPosePlugin !== null;

  // Callbacks estables con useRunInJS (que SÍ existe en worklets-core 0.4.0).
  const handlePose = useRunInJS(((p: PoseData | null) => {
    setPose(p);
  }) as any, []) as (p: PoseData | null) => void;

  const handleFps = useRunInJS(((t: number) => {
    if (lastTsRef.current > 0) {
      const delta = t - lastTsRef.current;
      if (delta > 0) setFps(Math.round(1000 / delta));
    }
    lastTsRef.current = t;
  }) as any, []) as (t: number) => void;

  useEffect(() => {
    if (!active) return;
    if (!isAvailable) {
      console.warn("[usePoseDetection] Plugin detectPose no disponible. ¿Está autolinkado?");
      return;
    }
    console.log("[usePoseDetection] activo, plugin disponible.");
  }, [active, isAvailable]);

  let frameProcessor: any = undefined;
  try {
    frameProcessor = useFrameProcessor((frame) => {
      "worklet";

      if (!active || !detectPosePlugin) return;

      let result: any = null;
      try {
        result = detectPosePlugin.call(frame, {
          mode: "stream",
          performanceMode: "max"
        });
      } catch (e) {
        return;
      }

      if (!result) {
        handlePose(null);
        return;
      }

      // El resultado del plugin es un objeto con landmarks.
      // Cada landmark tiene {x, y} en coordenadas de píxeles.
      // Lo pasamos tal cual al callback JS.
      handlePose(result);
      handleFps(frame.timestamp || 0);
    }, [active, handlePose, handleFps]);
  } catch (err: any) {
    console.warn("[usePoseDetection] useFrameProcessor falló:", err?.message ?? err);
  }

  return { pose, fps, frameProcessor, isAvailable };
}
