/**
 * landmarks.ts
 * ----------------------------------------------------------------------------
 * Índices y nombres de los 33 landmarks de MediaPipe Pose.
 * Estructura: cara (0-10), torso superior (11-16), torso inferior (23-28),
 * manos (17-22), pies (29-32).
 *
 * Referencia oficial:
 *   https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */
export const PoseLandmark = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32
} as const;

export type LandmarkIndex = typeof PoseLandmark[keyof typeof PoseLandmark];

export interface Landmark {
  /** Coordenadas normalizadas [0..1] respecto al frame */
  x: number;
  y: number;
  /** Profundidad relativa al centro de cadera (metros, signo hacia cámara) */
  z: number;
  /** Visibilidad [0..1] - ¿está visible en el frame? */
  v: number;
  /** Presencia [0..1] - ¿está presente en el frame? */
  p: number;
}

export type PoseFrame = {
  detected: boolean;
  timestampMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

/**
 * Conexiones óseas para dibujar el esqueleto (pares de índices).
 * Estilo "puntitos + lineas conectoras" del usuario.
 */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Cabeza
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso superior
  [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Tronco
  [11, 23], [12, 24], [23, 24],
  // Pierna izq
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Pierna der
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

/** Conjunto de articulaciones "clave" para el HUD (puntitos más grandes). */
export const KEY_JOINTS = new Set<number>([
  PoseLandmark.LEFT_SHOULDER,
  PoseLandmark.RIGHT_SHOULDER,
  PoseLandmark.LEFT_ELBOW,
  PoseLandmark.RIGHT_ELBOW,
  PoseLandmark.LEFT_WRIST,
  PoseLandmark.RIGHT_WRIST,
  PoseLandmark.LEFT_HIP,
  PoseLandmark.RIGHT_HIP,
  PoseLandmark.LEFT_KNEE,
  PoseLandmark.RIGHT_KNEE,
  PoseLandmark.LEFT_ANKLE,
  PoseLandmark.RIGHT_ANKLE
]);
