/**
 * angleUtils.ts
 * ----------------------------------------------------------------------------
 * Cálculo de ángulos articulares a partir de landmarks.
 * - `angle2D`: ángulo en el plano de pantalla (suficiente para la mayoría
 *   de ejercicios: sentadilla vista lateral, curl, press).
 * - `angle3D`: usa z (profundidad) para detectar rotaciones de torso.
 * - `signedAngle`: diferencia L/R para detectar asimetrías.
 *
 * Todos los ángulos están en grados [0..180], salvo `signedAngle` [-180..180].
 */
import type { Landmark } from "./landmarks";

/** Distancia euclídea 2D (en coordenadas normalizadas). */
export function dist2D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Ángulo entre tres puntos en 2D, con `b` como vértice.
 * Devuelve grados [0..180].
 *
 * Ejemplo: rodilla = angle2D(hip, knee, ankle)
 */
export function angle2D(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Ángulo entre tres puntos en 3D (usa z de MediaPipe).
 * Más preciso para detectar rotaciones de torso o cadera.
 */
export function angle3D(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.hypot(ab.x, ab.y, ab.z);
  const magCB = Math.hypot(cb.x, cb.y, cb.z);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Ángulo con signo: positivo si c está a la derecha del vector a->b
 * (en pantalla), negativo si a la izquierda.
 * Útil para detectar valgo de rodilla (rodilla entrando hacia dentro).
 */
export function signedAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const cross = ab.x * cb.y - ab.y * cb.x;
  const dot = ab.x * cb.x + ab.y * cb.y;
  const ang = Math.atan2(cross, dot) * (180 / Math.PI);
  return ang;
}

/**
 * Inclinación del torso respecto a la vertical.
 * Útil para detectar balanceo en curl, buena-mañana en sentadilla, etc.
 * @param shoulder  landmark del hombro (del lado visible)
 * @param hip        landmark de la cadera (del lado visible)
 * @returns grados respecto a la vertical absoluta [0..90]
 */
export function torsoInclination(shoulder: Landmark, hip: Landmark): number {
  // Vector vertical: (0, -1) si Y crece hacia abajo en pantalla
  const dx = shoulder.x - hip.x;
  const dy = hip.y - shoulder.y; // inversión porque y crece hacia abajo
  const ang = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
  return ang;
}

/** Lerp simple para suavizado de ángulos (evita jitter visual). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Suavizado exponencial: alpha=0.3 es ágil pero sin jitter. */
export function smooth(prev: number, next: number, alpha = 0.3): number {
  return lerp(prev, next, alpha);
}
