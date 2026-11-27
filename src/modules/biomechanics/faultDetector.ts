/**
 * faultDetector.ts
 * ----------------------------------------------------------------------------
 * Orquestador de detección de fallos biomecánicos.
 * Recibe un frame de landmarks + el preset activo, ejecuta cada detector y
 * acumula los códigos. También mapea códigos a mensajes legibles en español.
 */
import type { ExercisePreset } from "./exercisePresets";
import type { Landmark } from "./landmarks";

export interface DetectedFault {
  code: string;
  message: string;
  severity: "warning" | "error";
  /** Índice del landmark implicado para resaltarlo en el overlay. */
  landmarkIdx?: number;
}

const FAULT_MESSAGES: Record<string, { message: string; severity: "warning" | "error" }> = {
  // Sentadilla
  SQUAT_DEPTH_SHORT:    { message: "Profundidad corta: baja más la cadera", severity: "warning" },
  SQUAT_KNEE_VALGUS:    { message: "Valgo de rodilla: la rodilla entra hacia dentro", severity: "error" },
  SQUAT_TORSO_LEAN:     { message: "Torso muy inclinado hacia adelante", severity: "warning" },
  // Curl
  CURL_TORSO_SWING:     { message: "Balanceo de torso: usa menos impulso", severity: "warning" },
  CURL_ELBOW_FORWARD:   { message: "El codo avanza: mantenlo pegado al cuerpo", severity: "warning" },
  CURL_PARTIAL_TOP:     { message: "Rep incompleta arriba: extiende más el codo", severity: "warning" },
  // Press
  PRESS_BACK_ARCH:      { message: "Arqueo lumbar: aprieta el core", severity: "error" },
  // Códigos GENÉRICOS: son los que realmente devuelven los detectores de exercisePresets.ts
  // (antes no tenían mensaje y el HUD mostraba el código crudo, p. ej. "TORSO_LEAN").
  DEPTH_SHORT:          { message: "Profundidad corta: baja más", severity: "warning" },
  KNEE_VALGUS:          { message: "Rodillas hacia dentro: empújalas hacia afuera", severity: "error" },
  TORSO_LEAN:           { message: "Torso muy inclinado: pecho arriba, espalda neutra", severity: "warning" },
  PARTIAL_TOP:          { message: "Extiende completo arriba", severity: "warning" },
  BACK_ARCH:            { message: "Arqueo lumbar: aprieta el core", severity: "error" }
};

/** Mapea códigos a mensajes (exportado para el HUD). */
export function faultMessage(code: string): { message: string; severity: "warning" | "error" } {
  return FAULT_MESSAGES[code] ?? { message: code, severity: "warning" };
}

/**
 * Ejecuta todos los detectores del preset sobre un frame.
 * @returns array de DetectedFault (vacío si todo OK)
 */
export function detectFaults(
  preset: ExercisePreset,
  landmarks: Landmark[]
): DetectedFault[] {
  const codes: string[] = [];
  for (const detector of preset.faults) {
    const detected = detector(landmarks, preset.preferredSide);
    for (const c of detected) {
      if (!codes.includes(c)) codes.push(c);
    }
  }
  return codes.map((code) => {
    const { message, severity } = faultMessage(code);
    return { code, message, severity };
  });
}

/**
 * Códigos de fallo agrupados por articulación, para resaltar el landmark
 * implicado en el overlay de Skia.
 */
export const FAULT_TO_LANDMARK: Record<string, number[]> = {
  SQUAT_DEPTH_SHORT:    [11, 12, 23, 24, 25, 26],
  SQUAT_KNEE_VALGUS:    [25, 26],
  SQUAT_TORSO_LEAN:     [11, 12, 23, 24],
  CURL_TORSO_SWING:     [11, 12, 23, 24],
  CURL_ELBOW_FORWARD:   [13, 14],
  CURL_PARTIAL_TOP:     [13, 14],
  PRESS_BACK_ARCH:      [11, 12, 23, 24]
};
