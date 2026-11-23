/**
 * CalibrationOverlay.tsx
 * ----------------------------------------------------------------------------
 * Modo calibración / encuadre rápido:
 *   - Muestra una guía visual con un "frame" de área recomendada.
 *   - Cuenta atrás de 3 segundos.
 *   - Verifica que todos los landmarks necesarios (o al menos el tren
 *     superior/inferior según el ejercicio) tienen visibilidad > umbral.
 *   - Cuando pasa la verificación, auto-inicia el conteo.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Rect, Text as SkiaText, useFont } from "@shopify/react-native-skia";
import { colors, spacing, radius } from "@/theme/colors";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";
import type { ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { PoseLandmark } from "@/modules/biomechanics/landmarks";

interface CalibrationOverlayProps {
  pose: PoseFrame | null;
  preset: ExercisePreset;
  width: number;
  height: number;
  onCalibrated: () => void;
}

type CalibState = "checking" | "ok_countdown" | "failed_visibility";

const REQUIRED_LANDMARKS_FULL_BODY = [
  PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER,
  PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP,
  PoseLandmark.LEFT_KNEE, PoseLandmark.RIGHT_KNEE,
  PoseLandmark.LEFT_ANKLE, PoseLandmark.RIGHT_ANKLE
];

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  pose, preset, width, height, onCalibrated
}) => {
  const [state, setState] = useState<CalibState>("checking");
  const [countdown, setCountdown] = useState(3);

  // Comprueba visibilidad de los landmarks necesarios
  useEffect(() => {
    if (!pose || !pose.detected) {
      setState("failed_visibility");
      return;
    }
    const lm = pose.landmarks;
    const required = REQUIRED_LANDMARKS_FULL_BODY;
    const allVisible = required.every((idx) => {
      const l = lm[idx];
      return l && (l.v ?? 0) >= 0.5;
    });
    setState(allVisible ? "ok_countdown" : "failed_visibility");
  }, [pose]);

  // Countdown cuando todo OK
  useEffect(() => {
    if (state !== "ok_countdown") return;
    if (countdown <= 0) {
      onCalibrated();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [state, countdown, onCalibrated]);

  return (
    <View style={styles.absolute} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Marco guía */}
        <Rect
          x={width * 0.1}
          y={height * 0.08}
          width={width * 0.8}
          height={height * 0.84}
          style="stroke"
          color={state === "ok_countdown" ? colors.ok : colors.dim}
          strokeWidth={3}
        />
      </Canvas>
      <View style={styles.bottomCard}>
        <Text style={styles.title}>
          {state === "ok_countdown" && `Iniciando en ${countdown}…`}
          {state === "failed_visibility" && "Encuadre incompleto"}
          {state === "checking" && "Verificando…"}
        </Text>
        <Text style={styles.hint}>{preset.calibrationHint}</Text>
        {state === "failed_visibility" && (
          <Text style={styles.detail}>
            Asegúrate de que hombros, caderas, rodillas y tobillos sean visibles.
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  absolute: { ...StyleSheet.absoluteFillObject },
  bottomCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl + 90,
    backgroundColor: "rgba(8, 10, 14, 0.85)",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dim
  },
  title: {
    color: colors.bright,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  hint: { color: colors.textMuted, fontSize: 14 },
  detail: { color: colors.warning, fontSize: 13, marginTop: spacing.xs }
});
