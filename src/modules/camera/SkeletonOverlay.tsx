/**
 * SkeletonOverlay.tsx
 * ----------------------------------------------------------------------------
 * Overlay Skia que dibuja los "puntitos" y las líneas conectoras del
 * esqueleto sobre el preview de cámara.
 *
 * - Lee `poseShared.value` directamente desde el render thread (sin pasar
 *   por JS), por lo que el overlay va a 60fps sin jitter.
 * - Los puntos cambian de color según:
 *     verde  -> fase IDLE / correcta
 *     azul   -> fase ECCENTRIC (bajada)
 *     amarillo -> BOTTOM_CONTRACTED
 *     cyan   -> CONCENTRIC (subida)
 *     rojo   -> articulación implicada en un fallo biomecánico
 * - Las articulaciones "clave" (hombros, codos, caderas, rodillas, tobillos)
 *   se dibujan más grandes para máxima legibilidad en el gimnasio.
 */
import React from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { Canvas, Circle, Line, Path, Skia } from "@shopify/react-native-skia";
import {
  POSE_CONNECTIONS,
  KEY_JOINTS,
  type PoseFrame
} from "@/modules/biomechanics/landmarks";
import { colors } from "@/theme/colors";
import type { RepPhase } from "@/modules/biomechanics/repStateMachine";

interface SkeletonOverlayProps {
  poseShared: SharedValue<PoseFrame | null>;
  phaseShared: SharedValue<RepPhase>;
  /** Set de landmarks a resaltar en rojo (fallo detectado). */
  faultLandmarksShared: SharedValue<number[]>;
  /** Ancho y alto del canvas en px (debe coincidir con el Camera preview). */
  width: number;
  height: number;
}

const PHASE_COLOR: Record<RepPhase, string> = {
  IDLE: colors.ok,
  ECCENTRIC: colors.eccentric,
  BOTTOM_CONTRACTED: colors.bottom,
  CONCENTRIC: colors.concentric,
  TOP_LOCKED: colors.ok
};

export const SkeletonOverlay: React.FC<SkeletonOverlayProps> = ({
  poseShared,
  phaseShared,
  faultLandmarksShared,
  width,
  height
}) => {
  // Lista de pares [x1,y1,x2,y2] precalculados en el render thread
  const segments = useDerivedValue(() => {
    const pose = poseShared.value;
    if (!pose || !pose.detected || !pose.landmarks?.length) return [] as number[];
    const lm = pose.landmarks;
    const segs: number[] = [];
    for (const [i, j] of POSE_CONNECTIONS) {
      const a = lm[i]; const b = lm[j];
      if (!a || !b) continue;
      if ((a.v ?? 0) < 0.3 || (b.v ?? 0) < 0.3) continue;
      segs.push(a.x * width, a.y * height, b.x * width, b.y * height);
    }
    return segs;
  });

  // Path único con todos los segmentos (mucho más eficiente que N <Line/>)
  const segmentsPath = useDerivedValue(() => {
    const arr = segments.value;
    const path = Skia.Path.Make();
    for (let k = 0; k + 3 < arr.length; k += 4) {
      path.moveTo(arr[k], arr[k + 1]);
      path.lineTo(arr[k + 2], arr[k + 3]);
    }
    return path;
  });

  const strokeColor = useDerivedValue(() => PHASE_COLOR[phaseShared.value] ?? colors.ok);

  return (
    <Canvas style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }}>
      {/* Glow halo */}
      <Path
        path={segmentsPath}
        style="stroke"
        strokeWidth={10}
        color={strokeColor}
        opacity={0.25}
        strokeJoin="round"
        strokeCap="round"
      />
      {/* Línea principal */}
      <Path
        path={segmentsPath}
        style="stroke"
        strokeWidth={4}
        color={strokeColor}
        strokeJoin="round"
        strokeCap="round"
      />
      {/* Puntitos por landmark */}
      <PointsLayer
        poseShared={poseShared}
        faultLandmarksShared={faultLandmarksShared}
        width={width}
        height={height}
      />
    </Canvas>
  );
};

// ----------------------------------------------------------------------------
// Subcomponente para dibujar los 33 puntos (sin tocar el path de líneas)
// ----------------------------------------------------------------------------
const PointsLayer: React.FC<{
  poseShared: SharedValue<PoseFrame | null>;
  faultLandmarksShared: SharedValue<number[]>;
  width: number;
  height: number;
}> = ({ poseShared, faultLandmarksShared, width, height }) => {
  // No podemos mapear un array derivado directamente: renderizamos 33
  // <Circle/> fijos con posición derivada del landmark i.
  const circles = Array.from({ length: 33 }, (_, i) => (
    <SinglePoint
      key={i}
      idx={i}
      poseShared={poseShared}
      faultLandmarksShared={faultLandmarksShared}
      isKey={KEY_JOINTS.has(i)}
      width={width}
      height={height}
    />
  ));
  return <>{circles}</>;
};

const SinglePoint: React.FC<{
  idx: number;
  poseShared: SharedValue<PoseFrame | null>;
  faultLandmarksShared: SharedValue<number[]>;
  isKey: boolean;
  width: number;
  height: number;
}> = ({ idx, poseShared, faultLandmarksShared, isKey, width, height }) => {
  const cx = useDerivedValue(() => {
    const pose = poseShared.value;
    const lm = pose?.landmarks?.[idx];
    if (!lm || (lm.v ?? 0) < 0.3) return -100;
    return lm.x * width;
  });
  const cy = useDerivedValue(() => {
    const pose = poseShared.value;
    const lm = pose?.landmarks?.[idx];
    if (!lm || (lm.v ?? 0) < 0.3) return -100;
    return lm.y * height;
  });
  const isFault = useDerivedValue(() =>
    faultLandmarksShared.value.includes(idx)
  );
  const color = useDerivedValue(() => (isFault.value ? colors.error : colors.bright));
  const radius = isKey ? 8 : 4;

  return (
    <>
      {/* Halo */}
      <Circle cx={cx} cy={cy} r={radius + 4} color={color} opacity={0.3} />
      {/* Punto principal */}
      <Circle cx={cx} cy={cy} r={radius} color={color} />
    </>
  );
};
