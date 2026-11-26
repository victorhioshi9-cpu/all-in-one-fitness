/**
 * usePoseDetection.ts v0.5.0
 * ----------------------------------------------------------------------------
 * Hook que usa el plugin nativo 'detectPose' del paquete
 * @scottjgilroy/react-native-vision-camera-v4-pose-detection (Google ML Kit).
 *
 * v0.5.0 — Aplana landmarks en el worklet antes de pasar a JS.
 *   Los objetos anidados NO sobreviven el paso por useRunInJS (thread boundary).
 *   Antes: handlePose(result) donde result = { leftShoulderPosition: {x, y}, ... }
 *   Ahora: extraemos coordenadas en el worklet y pasamos un objeto PLANO:
 *     { leftShoulderPosition_x: 123, leftShoulderPosition_y: 456, ... }
 *   Esto SÍ sobrevive el paso por useRunInJS.
 */
import { useState, useRef, useEffect } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useRunInJS } from "react-native-worklets-core";
import { VisionCameraProxy } from "react-native-vision-camera";

let detectPosePlugin: any = null;
try {
  detectPosePlugin = VisionCameraProxy.initFrameProcessorPlugin("detectPose", {});
} catch (e) {
  console.warn("[usePoseDetection] No se pudo inicializar plugin detectPose:", e);
}

export interface FlatPose {
  [key: string]: number; // Claves: leftShoulderPosition_x, leftShoulderPosition_y, etc.
  _hasData: number; // 1 si hay landmarks, 0 si no
  _landmarkCount: number;
}

export interface UsePoseDetectionResult {
  pose: FlatPose | null;
  fps: number;
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
  isAvailable: boolean;
}

// Lista de nombres de landmarks que devuelve el plugin nativo (con sufijo Position)
const LANDMARK_KEYS = [
  "leftShoulderPosition", "rightShoulderPosition",
  "leftElbowPosition", "rightElbowPosition",
  "leftWristPosition", "rightWristPosition",
  "leftHipPosition", "rightHipPosition",
  "leftKneePosition", "rightKneePosition",
  "leftAnklePosition", "rightAnklePosition",
  "nosePosition", "leftEyePosition", "rightEyePosition",
  "leftEarPosition", "rightEarPosition"
];

export function usePoseDetection(active: boolean): UsePoseDetectionResult {
  const [pose, setPose] = useState<FlatPose | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const isAvailable = detectPosePlugin !== null;

  // Callback que recibe el pose aplastado y lo guarda en state.
  const handlePose = useRunInJS(((p: FlatPose | null) => {
    setPose(p);
  }) as any, []) as (p: FlatPose | null) => void;

  // Callback para FPS.
  const handleFps = useRunInJS(((fpsVal: number) => {
    setFps(fpsVal);
  }) as any, []) as (fpsVal: number) => void;

  useEffect(() => {
    if (!active) return;
    if (!isAvailable) {
      console.warn("[usePoseDetection] Plugin detectPose no disponible.");
      return;
    }
    console.log("[usePoseDetection] activo, plugin disponible.");
    const t = setTimeout(() => {
      if (frameCountRef.current === 0) {
        console.warn("[usePoseDetection] 3s sin frames procesados.");
      } else {
        console.log("[usePoseDetection] frames procesados:", frameCountRef.current);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [active, isAvailable]);

  let frameProcessor: any = undefined;
  try {
    frameProcessor = useFrameProcessor((frame) => {
      "worklet";

      if (!active || !detectPosePlugin) return;

      // Contar frames
      frameCountRef.current++;

      let result: any = null;
      try {
        result = detectPosePlugin.call(frame, {
          mode: "stream",
          performanceMode: "max"
        });
      } catch (e) {
        return;
      }

      if (!result || typeof result !== "object") {
        handlePose(null);
        return;
      }

      // APLANAR el resultado: extraer coordenadas de cada landmark
      // y pasarlas como números sueltos (no objetos anidados).
      // Esto es CRÍTICO porque useRunInJS no serializa bien objetos anidados.
      const flat: any = { _hasData: 0, _landmarkCount: 0 };
      let count = 0;

      for (let i = 0; i < LANDMARK_KEYS.length; i++) {
        const key = LANDMARK_KEYS[i];
        const lm = result[key];
        if (lm && typeof lm === "object") {
          const x = lm.x;
          const y = lm.y;
          if (typeof x === "number" && typeof y === "number" && (x !== 0 || y !== 0)) {
            flat[key + "_x"] = x;
            flat[key + "_y"] = y;
            count++;
          }
        }
      }

      flat._landmarkCount = count;
      flat._hasData = count > 0 ? 1 : 0;

      // FPS: usar Date.now() en vez de frame.timestamp (que puede ser 0).
      const now = Date.now();
      if (lastTsRef.current > 0) {
        const delta = now - lastTsRef.current;
        if (delta > 0) {
          const f = Math.round(1000 / delta);
          handleFps(f);
        }
      }
      lastTsRef.current = now;

      // Pasar el objeto plano a JS.
      if (count > 0) {
        handlePose(flat);
      } else {
        handlePose(null);
      }
    }, [active, handlePose, handleFps]);
  } catch (err: any) {
    console.warn("[usePoseDetection] useFrameProcessor falló:", err?.message ?? err);
  }

  return { pose, fps, frameProcessor, isAvailable };
}
