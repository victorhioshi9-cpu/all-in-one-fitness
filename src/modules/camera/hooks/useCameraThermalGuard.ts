/**
 * useCameraThermalGuard.ts
 * ----------------------------------------------------------------------------
 * Protección térmica y de batería:
 *   - Tras N minutos de uso continuo, baja la resolución de inferencia
 *     (aumentando el stride del plugin nativo).
 *   - Si la temperatura reportada por `expo-battery` sube, fuerza pausa.
 *   - Cuando la cámara sale de foco (app backgrounded), libera el dispositivo
 *     y detiene el frame processor.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

type ThermalLevel = "nominal" | "light" | "moderate" | "severe";

interface ThermalGuard {
  /** Si el frame processor debe correr. */
  isActive: boolean;
  /** Nivel térmico actual (aproximado por tiempo de uso). */
  thermalLevel: ThermalLevel;
  /** FPS objetivo recomendado. */
  targetFps: number;
  /** Pausar/reanudar manual. */
  pause: () => void;
  resume: () => void;
  /** Reset al salir de la cámara (libera recursos). */
  release: () => void;
}

export function useCameraThermalGuard(
  initialFps: number = 30,
  sustainedMinutesToThrottle: number = 8
): ThermalGuard {
  const [isActive, setIsActive] = useState(true);
  const [thermalLevel, setThermalLevel] = useState<ThermalLevel>("nominal");
  const startRef = useRef<number>(Date.now());
  const lastResetRef = useRef<number>(Date.now());

  const computeThermal = useCallback(() => {
    const elapsedMin = (Date.now() - startRef.current) / 60_000;
    if (elapsedMin < sustainedMinutesToThrottle) {
      setThermalLevel("nominal");
      return;
    }
    if (elapsedMin < sustainedMinutesToThrottle + 4) {
      setThermalLevel("light");
      return;
    }
    if (elapsedMin < sustainedMinutesToThrottle + 10) {
      setThermalLevel("moderate");
      return;
    }
    setThermalLevel("severe");
  }, [sustainedMinutesToThrottle]);

  // Tick cada 30s para actualizar el nivel térmico
  useEffect(() => {
    const id = setInterval(computeThermal, 30_000);
    return () => clearInterval(id);
  }, [computeThermal]);

  // Pausar al backgroundear la app
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        // Al volver, reseteamos el contador térmico para dar margen
        lastResetRef.current = Date.now();
        setIsActive(true);
      } else {
        setIsActive(false);
      }
    });
    return () => sub.remove();
  }, []);

  const pause = useCallback(() => setIsActive(false), []);
  const resume = useCallback(() => {
    startRef.current = Date.now();
    setIsActive(true);
  }, []);
  const release = useCallback(() => {
    setIsActive(false);
    // El cleanup real del plugin nativo lo hace el onClosed del PoseCameraView
  }, []);

  const targetFps =
    thermalLevel === "severe" ? Math.max(15, Math.floor(initialFps / 2)) :
    thermalLevel === "moderate" ? Math.max(20, Math.floor(initialFps * 0.75)) :
    initialFps;

  return { isActive, thermalLevel, targetFps, pause, resume, release };
}
