/**
 * usePoseFrameProcessorSimple.ts
 * ----------------------------------------------------------------------------
 * Hook SIMPLIFICADO de pose detection para VisionCamera v4.5.
 *
 * v0.4.1 — Ultra-defensivo. Sin runOnJS inline (que causaba crashes).
 *   Usa funciones estables definidas fuera del worklet.
 *   Todos los guards posibles en el resultado del plugin nativo.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { runOnJS } from "react-native-reanimated";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";

export interface UseSimplePoseResult {
  pose: PoseFrame | null;
  fps: number;
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
}

export function useSimplePoseFrameProcessor(active: boolean): UseSimplePoseResult {
  const [pose, setPose] = useState<PoseFrame | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Callbacks estables para runOnJS (NO inline).
  const handlePose = useCallback((p: PoseFrame | null) => {
    setPose(p);
  }, []);

  const handleFps = useCallback((t: number) => {
    if (lastTsRef.current > 0) {
      const delta = t - lastTsRef.current;
      if (delta > 0) setFps(Math.round(1000 / delta));
    }
    lastTsRef.current = t;
  }, []);

  const incrementFrameCount = useCallback(() => {
    frameCountRef.current++;
  }, []);

  useEffect(() => {
    if (!active) return;
    console.log("[useSimplePose] hook activo.");
    const timeout = setTimeout(() => {
      if (frameCountRef.current === 0) {
        console.warn("[useSimplePose] 3s sin frames procesados.");
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [active]);

  let frameProcessor: any = undefined;
  try {
    frameProcessor = useFrameProcessor((frame) => {
      "worklet";

      if (!active) return;

      // Contar frames (con callback estable).
      runOnJS(incrementFrameCount)();

      // Invocar plugin nativo.
      let result: any = null;
      try {
        result = (frame as any).__callFrameProcessorPlugin?.("poseLandmarker", {
          orientation: "portrait"
        });
      } catch (e) {
        return;
      }

      // Guards exhaustivos.
      if (!result || typeof result !== "object") {
        runOnJS(handlePose)(null);
        return;
      }

      if (typeof result.detected !== "boolean") {
        runOnJS(handlePose)(null);
        return;
      }

      if (!result.detected) {
        runOnJS(handlePose)({
          detected: false,
          timestampMs: Number(result.timestampMs) || Date.now(),
          landmarks: []
        });
        return;
      }

      // Landmarks debe ser array.
      const rawLandmarks = Array.isArray(result.landmarks) ? result.landmarks : [];
      const landmarks: any[] = [];
      for (let i = 0; i < rawLandmarks.length; i++) {
        const l = rawLandmarks[i];
        if (!l || typeof l !== "object") {
          landmarks.push({ x: 0, y: 0, z: 0, v: 0, p: 0 });
        } else {
          landmarks.push({
            x: typeof l.x === "number" ? l.x : Number(l.x) || 0,
            y: typeof l.y === "number" ? l.y : Number(l.y) || 0,
            z: typeof l.z === "number" ? l.z : Number(l.z) || 0,
            v: typeof l.v === "number" ? l.v : Number(l.v) || 0,
            p: typeof l.p === "number" ? l.p : Number(l.p) || 0
          });
        }
      }

      const poseFrame: PoseFrame = {
        detected: true,
        timestampMs: Number(result.timestampMs) || Date.now(),
        landmarks,
        worldLandmarks: Array.isArray(result.worldLandmarks) ? result.worldLandmarks : undefined
      };

      // FPS.
      const ts = frame.timestamp || 0;
      runOnJS(handleFps)(ts);
      runOnJS(handlePose)(poseFrame);
    }, [active, handlePose, handleFps, incrementFrameCount]);
  } catch (err: any) {
    console.warn("[useSimplePose] useFrameProcessor falló:", err?.message ?? err);
  }

  return { pose, fps, frameProcessor };
}
