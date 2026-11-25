/**
 * usePoseFrameProcessorSimple.ts
 * ----------------------------------------------------------------------------
 * Hook SIMPLIFICADO de pose detection para VisionCamera v4.5.
 *
 * DIFERENCIA con usePoseFrameProcessor.ts:
 *   - NO usa useSharedValue (react-native-reanimated). El SharedValue + Skia
 *     Canvas rompía gesture handling en New Arch → los toques no funcionaban.
 *   - Usa state normal de React (useState + useCallback).
 *   - El frame processor llama al plugin nativo y dispatcha el resultado al
 *     hilo JS con runOnJS. El hilo JS actualiza el state, y React re-renderiza.
 *
 * RENDIMIENTO:
 *   - Esto es MENOS eficiente que SharedValue (copia por JS bridge ~30-60fps).
 *   - PERO es estable y no rompe gesture handling.
 *   - Para 60fps sin jitter haría falta Skia render thread, pero eso rompe
 *     toques. Preferimos estable a 30fps que inestable a 60fps.
 *
 * REQUISITOS:
 *   - El plugin nativo "poseLandmarker" debe estar registrado. Si no lo está
 *     (porque with-native-pose.js está desactivado en app.config.ts), el
 *     callback devuelve null y la app no crashea (graceful degradation).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { Worklets } from "react-native-worklets-core";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";

export interface UseSimplePoseResult {
  /** Última pose detectada (null si no hay). */
  pose: PoseFrame | null;
  /** FPS aproximado del frame processor. */
  fps: number;
  /** El frameProcessor para pasar al componente <Camera frameProcessor={...} />. */
  frameProcessor: ReturnType<typeof useFrameProcessor>;
}

export function useSimplePoseFrameProcessor(active: boolean): UseSimplePoseResult {
  const [pose, setPose] = useState<PoseFrame | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);

  // Callback que corre en hilo JS. Lo creamos una sola vez.
  const jsCallback = Worklets.useRunOnJS((pose: PoseFrame | null) => {
    setPose(pose);
  });

  const fpsTick = Worklets.useRunOnJS((ts: number) => {
    if (lastTsRef.current > 0) {
      const delta = ts - lastTsRef.current;
      if (delta > 0) setFps(Math.round(1000 / delta));
    }
    lastTsRef.current = ts;
  });

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";

    if (!active) return;

    // Invoca el plugin nativo "poseLandmarker" si está registrado.
    // Si no lo está, el operador ?. devuelve undefined y devolvemos null.
    let result: any = null;
    try {
      result = (frame as any).__callFrameProcessorPlugin?.("poseLandmarker", {
        orientation: "portrait"
      });
    } catch (e) {
      // Plugin no registrado o frame inválido. Graceful.
      return;
    }

    if (!result) {
      jsCallback(null);
      return;
    }

    if (!result.detected) {
      jsCallback({
        detected: false,
        timestampMs: result.timestampMs ?? Date.now(),
        landmarks: []
      });
      return;
    }

    const landmarks = ((result.landmarks || []) as any[]).map((l) => ({
      x: Number(l.x), y: Number(l.y), z: Number(l.z),
      v: Number(l.v ?? 0), p: Number(l.p ?? 0)
    }));

    const poseFrame: PoseFrame = {
      detected: true,
      timestampMs: Number(result.timestampMs),
      landmarks,
      worldLandmarks: (result.worldLandmarks || []) as any[] | undefined
    };

    fpsTick(frame.timestamp);
    jsCallback(poseFrame);
  }, [active]);

  return { pose, fps, frameProcessor };
}
