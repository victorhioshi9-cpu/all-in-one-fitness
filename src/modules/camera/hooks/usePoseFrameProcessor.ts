/**
 * usePoseFrameProcessor.ts
 * ----------------------------------------------------------------------------
 * Hook que enlaza el `useFrameProcessor` de VisionCamera con el plugin nativo
 * `poseLandmarker` (Kotlin) y devuelve los landmarks al hilo UI.
 *
 * Estrategia:
 *   1) El frame processor corre en un hilo nativo (no JS, no UI).
 *   2) Llama al plugin nativo `poseLandmarker` -> devuelve landmarks.
 *   3) El resultado se publica en un SharedValue (Reanimated) leído por el
 *      overlay de Skia en el render thread -> cero copias por el JS bridge.
 *   4) En paralelo, dispatcha al hilo JS para el rep counting y los fallos.
 */
import { useFrameProcessor } from "react-native-vision-camera";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { Worklets } from "react-native-worklets-core";
import type { PoseFrame, Landmark } from "@/modules/biomechanics/landmarks";

interface UsePoseFrameProcessorResult {
  /** SharedValue accesible desde Skia (render thread, 60fps sin bridge). */
  poseShared: SharedValue<PoseFrame | null>;
  /** Sufijo de frames procesados (para HUD). */
  fpsShared: SharedValue<number>;
}

export function usePoseFrameProcessor(
  onPose: (frame: PoseFrame) => void
): UsePoseFrameProcessorResult {
  const poseShared = useSharedValue<PoseFrame | null>(null);
  const fpsShared = useSharedValue(0);

  // Cola callable desde worklet -> hilo JS
  const jsCallback = Worklets.createRunInJsContext((pose: PoseFrame) => {
    onPose(pose);
  });

  const fpsTick = Worklets.createRunInJsContext((ms: number) => {
    // FPS aproximado en el último segundo
    fpsShared.value = Math.round(1000 / Math.max(1, ms));
  });

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";

    // Invoca el plugin nativo registrado como "poseLandmarker"
    const result = (frame as any).__callFrameProcessorPlugin?.("poseLandmarker", {
      orientation: "portrait"
    }) ??
    // Fallback compat: API alternativa
    (global as any).VisionCameraProxy?.getFrameProcessorPlugin?.("poseLandmarker")?.callback?.(frame, { orientation: "portrait" });

    if (!result) {
      poseShared.value = null;
      return;
    }

    if (!result.detected) {
      poseShared.value = {
        detected: false,
        timestampMs: result.timestampMs ?? Date.now(),
        landmarks: []
      };
      return;
    }

    const landmarks: Landmark[] = ((result.landmarks || []) as any[]).map((l) => ({
      x: Number(l.x), y: Number(l.y), z: Number(l.z),
      v: Number(l.v ?? 0), p: Number(l.p ?? 0)
    }));

    const poseFrame: PoseFrame = {
      detected: true,
      timestampMs: Number(result.timestampMs),
      landmarks,
      worldLandmarks: (result.worldLandmarks || []) as Landmark[] | undefined
    };

    poseShared.value = poseFrame;
    fpsTick(frame.timestamp);
    jsCallback(poseFrame);
  }, []);

  return { poseShared, fpsShared };
}
