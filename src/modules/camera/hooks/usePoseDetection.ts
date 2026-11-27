/**
 * usePoseDetection.ts v0.6.0
 * ----------------------------------------------------------------------------
 * Pose detection con ML Kit (@scottjgilroy/react-native-vision-camera-v4-pose-detection).
 *
 * Cambios v0.6.0:
 *   - El plugin nativo se inicializa de forma PEREZOSA y con reintentos
 *     (antes se creaba una sola vez al importar el módulo; si fallaba en ese
 *     instante quedaba en null hasta cerrar y abrir la app).
 *   - Se envía el tamaño REAL del frame (_frameW/_frameH, en orientación
 *     vertical) para escalar bien el esqueleto y el contador de reps.
 *   - setPose se limita a ~20 actualizaciones/s para no re-renderizar a cada frame.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useFrameProcessor, VisionCameraProxy } from "react-native-vision-camera";
import { useRunInJS } from "react-native-worklets-core";

let cachedPlugin: any = null;
function getPlugin(): any {
  if (cachedPlugin) return cachedPlugin;
  try {
    cachedPlugin = VisionCameraProxy.initFrameProcessorPlugin("detectPose", {}) ?? null;
  } catch (e) {
    console.warn("[usePoseDetection] initFrameProcessorPlugin falló:", e);
    cachedPlugin = null;
  }
  return cachedPlugin;
}

export interface FlatPose {
  [key: string]: number;
  _hasData: number;
  _landmarkCount: number;
  /** Ancho del frame en orientación vertical (px). */
  _frameW: number;
  /** Alto del frame en orientación vertical (px). */
  _frameH: number;
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

const MAX_PLUGIN_RETRIES = 10;

export function usePoseDetection(active: boolean): UsePoseDetectionResult {
  const [pose, setPose] = useState<FlatPose | null>(null);
  const [fps, setFps] = useState(0);
  const lastTsRef = useRef<number>(0);
  const lastPoseTsRef = useRef<number>(0);
  const loggedRef = useRef<boolean>(false);

  // Plugin con reintentos (1 por segundo, máx. 10) mientras esté activo.
  const [pluginTick, setPluginTick] = useState(0);
  const plugin = useMemo(() => getPlugin(), [pluginTick]);
  const isAvailable = plugin !== null;

  useEffect(() => {
    if (!active || plugin || pluginTick >= MAX_PLUGIN_RETRIES) return;
    const t = setTimeout(() => setPluginTick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [active, plugin, pluginTick]);

  const handlePose = useRunInJS(((p: FlatPose | null) => {
    setPose(p);
  }) as any, []) as (p: FlatPose | null) => void;

  const handleFps = useRunInJS(((fpsVal: number) => {
    setFps(fpsVal);
  }) as any, []) as (fpsVal: number) => void;

  const handleLog = useRunInJS(((msg: string) => {
    console.log(msg);
  }) as any, []) as (msg: string) => void;

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (!active || !plugin) return;

    let result: any = null;
    try {
      result = plugin.call(frame, { mode: "stream", performanceMode: "max" });
    } catch (e) {
      return;
    }

    if (!result || typeof result !== "object") {
      handlePose(null);
      return;
    }

    // Tamaño del frame en vertical. El buffer de la cámara suele ser apaisado
    // (p. ej. 640x480) y ML Kit devuelve coordenadas ya giradas a vertical.
    const fw = frame.width;
    const fh = frame.height;
    const frameW = fw > fh ? fh : fw;
    const frameH = fw > fh ? fw : fh;

    const flat: any = { _hasData: 0, _landmarkCount: 0, _frameW: frameW, _frameH: frameH };
    let count = 0;
    let maxX = 0;
    let maxY = 0;

    for (let i = 0; i < LANDMARK_KEYS.length; i++) {
      const key = LANDMARK_KEYS[i];
      const lm = result[key];
      if (lm && typeof lm === "object") {
        const x = lm.x;
        const y = lm.y;
        if (typeof x === "number" && typeof y === "number") {
          flat[key + "_x"] = x;
          flat[key + "_y"] = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }

    flat._landmarkCount = count;
    flat._hasData = count > 0 ? 1 : 0;

    // Log de diagnóstico (una vez): permite verificar la escala real.
    if (count > 0 && !loggedRef.current) {
      loggedRef.current = true;
      handleLog(
        "[pose] frame=" + fw + "x" + fh + " orient=" + frame.orientation +
        " upright=" + frameW + "x" + frameH + " maxX=" + Math.round(maxX) + " maxY=" + Math.round(maxY)
      );
    }

    const now = Date.now();
    if (lastTsRef.current > 0) {
      const delta = now - lastTsRef.current;
      if (delta > 0) handleFps(Math.round(1000 / delta));
    }
    lastTsRef.current = now;

    // Throttle a ~20 actualizaciones/s hacia React.
    if (now - lastPoseTsRef.current >= 50) {
      lastPoseTsRef.current = now;
      handlePose(count > 0 ? flat : null);
    }
  }, [active, plugin, handlePose, handleFps, handleLog]);

  return { pose, fps, frameProcessor, isAvailable };
}
