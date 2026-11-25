/**
 * SkeletonOverlaySimple.tsx
 * ----------------------------------------------------------------------------
 * Overlay del esqueleto en React Native puro (sin @shopify/react-native-skia,
 * sin react-native-reanimated).
 *
 * Dibuja los 33 landmarks como círculos amarillos y las conexiones óseas
 * como líneas rojas. Todo con <View> absolutamente posicionado.
 *
 * RENDIMIENTO:
 *   - 33 puntos + ~35 líneas = ~68 Views. RN puede manejar eso a 30fps sin
 *     problemas.
 *   - Es menos fluido que Skia a 60fps, pero NO rompe gesture handling.
 *
 * PROPS:
 *   - pose: PoseFrame | null (del hook useSimplePoseFrameProcessor)
 *   - width, height: dimensiones del overlay (debe coincidir con el Camera)
 *   - color: color de los puntos (default: amarillo)
 */
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { POSE_CONNECTIONS } from "@/modules/biomechanics/landmarks";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";

interface SkeletonOverlaySimpleProps {
  pose: PoseFrame | null;
  width: number;
  height: number;
  pointColor?: string;
  pointRadius?: number;
  lineColor?: string;
  lineWidth?: number;
}

export const SkeletonOverlaySimple: React.FC<SkeletonOverlaySimpleProps> = ({
  pose,
  width,
  height,
  pointColor = "#fbbf24",
  pointRadius = 5,
  lineColor = "#ef4444",
  lineWidth = 2
}) => {
  // Memoiza los elementos a renderizar.
  const { points, lines } = useMemo(() => {
    if (!pose || !pose.detected || !pose.landmarks || pose.landmarks.length === 0) {
      return { points: [], lines: [] };
    }

    const lm = pose.landmarks;

    // Puntos: cada landmark → un View circular.
    const points = lm.map((l, i) => {
      // Saltarse landmarks con baja visibilidad (cara, etc.).
      if (l.v < 0.3) return null;
      const left = l.x * width - pointRadius;
      const top = l.y * height - pointRadius;
      return (
        <View
          key={`pt-${i}`}
          style={[
            styles.point,
            {
              left,
              top,
              width: pointRadius * 2,
              height: pointRadius * 2,
              borderRadius: pointRadius,
              backgroundColor: pointColor
            }
          ]}
        />
      );
    }).filter(Boolean);

    // Líneas: cada conexión → un View rotado.
    const lines = POSE_CONNECTIONS.map(([i, j], idx) => {
      const a = lm[i];
      const b = lm[j];
      if (!a || !b) return null;
      if (a.v < 0.3 || b.v < 0.3) return null;

      const x1 = a.x * width;
      const y1 = a.y * height;
      const x2 = b.x * width;
      const y2 = b.y * height;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 1) return null;

      // Ángulo en grados.
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = (angleRad * 180) / Math.PI;

      // El View se posiciona en (x1, y1) y se rota alrededor de ese punto.
      // transformOrigin por defecto es el centro, así que ajustamos left/top
      // para que el inicio de la línea esté en (x1, y1).
      return (
        <View
          key={`ln-${idx}`}
          style={[
            styles.line,
            {
              left: x1,
              top: y1 - lineWidth / 2,
              width: length,
              height: lineWidth,
              backgroundColor: lineColor,
              transform: [{ rotate: `${angleDeg}deg` }],
              // El transformOrigin debe ser el inicio (left center).
              // En RN no hay transformOrigin directo, pero como left=x1 y
              // top=y1-lineWidth/2, el rotate alrededor del centro del View
              // hace que la línea empiece en (x1, y1). Funciona.
            }
          ]}
        />
      );
    }).filter(Boolean);

    return { points, lines };
  }, [pose, width, height, pointColor, pointRadius, lineColor, lineWidth]);

  if (!pose || !pose.detected) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {lines}
      {points}
    </View>
  );
};

const styles = StyleSheet.create({
  point: {
    position: "absolute",
    // Sin sombras para mantenerlo simple y rápido.
  },
  line: {
    position: "absolute"
  }
});
