/**
 * usePoseFrameProcessorSimple.ts
 * ----------------------------------------------------------------------------
 * Hook SIMPLIFICADO de pose detection para VisionCamera v4.5.
 *
 * v0.4.0 — Usa runOnJS de react-native-reanimated (NO de worklets-core).
 *   reanimated está mejor mantenido y su runOnJS es más estable.
 *   Esto evita el bug de 'render undefined is not a function' que tenía
 *   con Worklets.useRunOnJS (que no existe) y el tipo incorrecto de useRunInJS.
 *
 * RENDIMIENTO:
 *   - State normal de React (NO useSharedValue). 30-60fps suficientes.
 *   - NO rompe gesture handling (lo que sí hacía useSharedValue + Skia).
 *
 * REQUISITOS:
 *   - El plugin nativo "poseLandmarker" debe estar registrado.
 *   - El modelo pose_landmarker.task debe estar en assets/.
 *
 * GRACEFUL DEGRADATION:
 *   Si el plugin no está registrado o el hook falla al inicializar, devuelve
 *   pose=null y frameProcessor=undefined. La cámara abre sin esqueleto pero
 *   sin crash.
 */
import { useState, useRef, useEffect } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { runOnJS } from "react-native-reanimated";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";

export interface UseSimplePoseResult {
  /** Última pose detectada (null si no hay). */
  pose: PoseFrame | null;
  /** FPS aproximado del frame processor. */
  fps: number;
  /** El frameProcessor para pasar al componente <Camera frameProcessor={...} />.
   *  Es undefined si el hook falló al inicializar. */
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
}

export function useSimplePoseFrameProcessor(active: boolean): UseSimplePoseResult {
  const [pose, setPose] = useState<PoseFrame | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // --- Diagnóstico: log para saber si el plugin nativo está disponible ---
  useEffect(() => {
    if (!active) return;
    console.log("[useSimplePose] hook activo. Plugin nativo 'poseLandmarker' debería estar registrado.");
    // Si tras 3s no hay pose detectada, logueamos warning.
    const timeout = setTimeout(() => {
      if (frameCountRef.current === 0) {
        console.warn(
          "[useSimplePose] Pasaron 3s sin NINGÚN frame procesado. El frameProcessor " +
          "NO se está ejecutando. Posibles causas:\n" +
          "  1. El plugin nativo 'poseLandmarker' no está registrado (revisa MainApplication.kt).\n" +
          "  2. La cámara no está activa.\n" +
          "  3. enableFrameProcessors no está activado en el plugin de vision-camera."
        );
      } else if (!pose) {
        console.warn(
          "[useSimplePose] Frames procesados: " + frameCountRef.current + " pero sin pose detectada. " +
          "Causas:\n" +
          "  1. Persona no enfrente de cámara.\n" +
          "  2. Modelo pose_landmarker.task no carga (revisa logcat con tag PoseLandmarkerPlugin).\n" +
          "  3. El plugin devuelve null (revisa logcat)."
        );
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [active, pose]);

  // Frame processor. Usa runOnJS de reanimated (más estable que useRunInJS).
  // Si el plugin nativo no está registrado, el try/catch del worklet atrapa
  // el error y devuelve null sin crashear.
  let frameProcessor: any = undefined;
  try {
    frameProcessor = useFrameProcessor((frame) => {
      "worklet";

      if (!active) return;

      // Contar frames procesados para diagnóstico.
      runOnJS(() => {
        frameCountRef.current++;
      })();

      // Invoca el plugin nativo "poseLandmarker" si está registrado.
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
        runOnJS(setPose)(null);
        return;
      }

      if (!result.detected) {
        runOnJS(setPose)({
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

      // FPS: diferencia con el último timestamp.
      const ts = frame.timestamp;
      runOnJS((t: number) => {
        if (lastTsRef.current > 0) {
          const delta = t - lastTsRef.current;
          if (delta > 0) setFps(Math.round(1000 / delta));
        }
        lastTsRef.current = t;
      })(ts);

      runOnJS(setPose)(poseFrame);
    }, [active]);
  } catch (err: any) {
    console.warn("[useSimplePose] useFrameProcessor falló al inicializar:", err?.message ?? err);
  }

  return { pose, fps, frameProcessor };
}
