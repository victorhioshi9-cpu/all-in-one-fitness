/**
 * usePoseDetection.ts v0.5.0
 * ----------------------------------------------------------------------------
 * Hook que usa el plugin nativo 'detectPose' del paquete
 * @scottjgilroy/react-native-vision-camera-v4-pose-detection (Google ML Kit).
 *
 * APLANA landmarks en el worklet antes de pasar a JS.
 * Los objetos anidados NO sobreviven el paso por useRunInJS (thread boundary).
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
  [key: string]: number;
  _hasData: number;
  _landmarkCount: number;
}

export interface UsePoseDetectionResult {
  pose: FlatPose | null;
  fps: number;
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
  isAvailable: boolean;
}

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

  const handlePose = useRunInJS(((p: FlatPose | null) => {
    setPose(p);
  }) as any, []) as (p: FlatPose | null) => void;

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
      console.log("[usePoseDetection] frames procesados:", frameCountRef.current);
    }, 3000);
    return () => clearTimeout(t);
  }, [active, isAvailable]);

  let frameProcessor: any = undefined;
  try {
    frameProcessor = useFrameProcessor((frame) => {
      "worklet";

      if (!active || !detectPosePlugin) return;

      frameCountRef.current++;

      // Log de diagnóstico UNA sola vez (primer frame exitoso).
      if (frameCountRef.current === 1) {
        console.log("[usePoseDetection] PRIMER FRAME:", "w=" + (frame as any).width, "h=" + (frame as any).height);
      }

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

      // APLANAR y NORMALIZAR coordenadas a 0-1 usando dimensiones reales del frame.
      // ML Kit devuelve píxeles del frame original. frame.width/height nos dan
      // las dimensiones reales. Normalizamos a 0-1 para que el overlay pueda
      // escalar a cualquier pantalla sin adivinar dimensiones.
      const fw = (frame as any).width || 1080;
      const fh = (frame as any).height || 1920;

      const flat: any = { _hasData: 0, _landmarkCount: 0, _fw: fw, _fh: fh };
      let count = 0;

      for (let i = 0; i < LANDMARK_KEYS.length; i++) {
        const key = LANDMARK_KEYS[i];
        const lm = result[key];
        if (lm && typeof lm === "object") {
          const x = lm.x;
          const y = lm.y;
          if (typeof x === "number" && typeof y === "number") {
            // Normalizar a 0-1 dividiendo por dimensiones del frame.
            flat[key + "_x"] = x / fw;
            flat[key + "_y"] = y / fh;
            count++;
          }
        }
      }

      flat._landmarkCount = count;
      flat._hasData = count > 0 ? 1 : 0;

      // FPS
      const now = Date.now();
      if (lastTsRef.current > 0) {
        const delta = now - lastTsRef.current;
        if (delta > 0) {
          handleFps(Math.round(1000 / delta));
        }
      }
      lastTsRef.current = now;

      handlePose(count > 0 ? flat : null);
    }, [active, handlePose, handleFps]);
  } catch (err: any) {
    console.warn("[usePoseDetection] useFrameProcessor falló:", err?.message ?? err);
  }

  return { pose, fps, frameProcessor, isAvailable };
}
