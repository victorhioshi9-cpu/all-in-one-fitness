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
 *     hilo JS con useRunInJS. El hilo JS actualiza el state, y React re-renderiza.
 *
 * API REAL de react-native-worklets-core v0.4.0:
 *   - import { useRunInJS } from "react-native-worklets-core"
 *   - useRunInJS(callback, deps) → devuelve función callable desde worklet
 *   - NO existe Worklets.useRunOnJS (eso causaba 'render undefined is not a function')
 *
 * RENDIMIENTO:
 *   - Esto es MENOS eficiente que SharedValue (copia por JS bridge ~30-60fps).
 *   - PERO es estable y no rompe gesture handling.
 *
 * REQUISITOS:
 *   - El plugin nativo "poseLandmarker" debe estar registrado. Si no lo está
 *     (porque with-native-pose.js está desactivado en app.config.ts), el
 *     callback devuelve null y la app no crashea (graceful degradation).
 */
import { useState, useRef } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useRunInJS } from "react-native-worklets-core";
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
  // useRunInJS devuelve una función que se puede llamar desde el worklet
  // para ejecutar el callback en el hilo JS.
  //
  // NOTA: el tipo TypeScript de useRunInJS está mal (dice TArguments extends []
  // = sin args) pero en runtime SÍ acepta argumentos (usa Worklets.createRunInJsFn
  // internamente). Usamos `as any` para bypassear el tipo incorrecto.
  const jsCallback = useRunInJS(((p: PoseFrame | null) => {
    setPose(p);
  }) as any, []) as (p: PoseFrame | null) => void;

  const fpsTick = useRunInJS(((ts: number) => {
    if (lastTsRef.current > 0) {
      const delta = ts - lastTsRef.current;
      if (delta > 0) setFps(Math.round(1000 / delta));
    }
    lastTsRef.current = ts;
  }) as any, []) as (ts: number) => void;

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";

    if (!active) return;

    // Invoca el plugin nativo "poseLandmarker" si está registrado.
    // Si no lo está, devuelve undefined y devolvemos null sin crashear.
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
  }, [active, jsCallback, fpsTick]);

  return { pose, fps, frameProcessor };
}
