/**
 * SmallSpaceGuide.tsx
 * ----------------------------------------------------------------------------
 * Guía visual para gimnasios con espacio reducido.
 *
 * Detecta si solo el tren superior o inferior entra en el frame y ajusta:
 *   - Sugiere al usuario alejarse o girar 45° si no cabe todo el cuerpo.
 *   - Si el ejercicio es de tren superior (curl, press), permite continuar con
 *     encuadre parcial (de cintura para arriba) y desactiva las reglas de
 *     fatiga que dependan de landmarks de piernas.
 *   - Muestra un overlay "OK" cuando el encuadre es suficiente.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Rect, Line as SkiaLine, Path } from "@shopify/react-native-skia";
import { colors, spacing, radius } from "@/theme/colors";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";
import { PoseLandmark } from "@/modules/biomechanics/landmarks";

interface SmallSpaceGuideProps {
  pose: PoseFrame | null;
  exerciseId: string;
  width: number;
  height: number;
  onAdequateChange?: (adequate: boolean) => void;
}

type FrameStatus =
  | "full_body_ok"
  | "upper_only_ok"
  | "lower_only_ok"
  | "too_close"
  | "no_pose";

export const SmallSpaceGuide: React.FC<SmallSpaceGuideProps> = ({
  pose, exerciseId, width, height, onAdequateChange
}) => {
  const [status, setStatus] = useState<FrameStatus>("no_pose");

  useEffect(() => {
    if (!pose || !pose.detected || !pose.landmarks.length) {
      setStatus("no_pose");
      onAdequateChange?.(false);
      return;
    }
    const lm = pose.landmarks;
    const shoulder = lm[PoseLandmark.LEFT_SHOULDER];
    const hip = lm[PoseLandmark.LEFT_HIP];
    const knee = lm[PoseLandmark.LEFT_KNEE];
    const ankle = lm[PoseLandmark.LEFT_ANKLE];

    const visibleUpper = shoulder && hip && (shoulder.v ?? 0) > 0.5 && (hip.v ?? 0) > 0.5;
    const visibleLower = hip && ankle && (hip.v ?? 0) > 0.5 && (ankle.v ?? 0) > 0.5;
    const visibleFull = visibleUpper && visibleLower && knee && (knee.v ?? 0) > 0.5;

    if (visibleFull) {
      // Verificar también que no esté demasiado cerca
      const bodyHeightPx = Math.abs(shoulder.y - ankle.y) * height;
      if (bodyHeightPx > height * 0.9) {
        setStatus("too_close");
        onAdequateChange?.(false);
      } else {
        setStatus("full_body_ok");
        onAdequateChange?.(true);
      }
    } else if (visibleUpper && (exerciseId === "bicep_curl" || exerciseId === "shoulder_press")) {
      setStatus("upper_only_ok");
      onAdequateChange?.(true);
    } else if (visibleLower && exerciseId === "squat") {
      setStatus("lower_only_ok");
      onAdequateChange?.(true);
    } else {
      setStatus("too_close");
      onAdequateChange?.(false);
    }
  }, [pose, exerciseId, onAdequateChange]);

  const guideText = STATUS_TEXT[status];
  const guideColor = STATUS_COLOR[status];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Marco de área recomendada */}
        <Rect
          x={width * 0.08}
          y={height * 0.05}
          width={width * 0.84}
          height={height * 0.90}
          style="stroke"
          color={guideColor}
          strokeWidth={2}
          opacity={0.6}
        />
        {/* Líneas guía horizontal (referencia cintura) */}
        <SkiaLine
          startX={width * 0.08}
          startY={height * 0.55}
          endX={width * 0.92}
          endY={height * 0.55}
          color={guideColor}
          strokeWidth={1}
          style="stroke"
          opacity={0.3}
        />
      </Canvas>
      <View style={[styles.badge, { backgroundColor: `${guideColor}22`, borderColor: guideColor }]}>
        <Text style={[styles.badgeText, { color: guideColor }]}>{guideText}</Text>
      </View>
    </View>
  );
};

const STATUS_TEXT: Record<FrameStatus, string> = {
  full_body_ok: "Cuerpo completo OK",
  upper_only_ok: "Tren superior OK",
  lower_only_ok: "Tren inferior OK",
  too_close: "Alejate un poco",
  no_pose: "Posiciónate de perfil"
};

const STATUS_COLOR: Record<FrameStatus, string> = {
  full_body_ok: colors.ok,
  upper_only_ok: colors.ok,
  lower_only_ok: colors.ok,
  too_close: colors.warning,
  no_pose: colors.textMuted
};

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: spacing.xl + 60,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1
  },
  badgeText: { fontSize: 13, fontWeight: "800" }
});
