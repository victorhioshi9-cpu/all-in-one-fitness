/**
 * RepCounterHUD.tsx
 * ----------------------------------------------------------------------------
 * HUD que muestra sobre la cámara:
 *   - Conteo de repeticiones (gigante, alto contraste)
 *   - Ángulo articular actual
 *   - Fase actual (bajada / subida)
 *   - Fallos biomecánicos detectados en la rep en curso
 *   - Tempo de la última rep (eccentric/concentric)
 *   - Botón grande "Terminar serie"
 *
 * Pensado para ser usado con una sola mano: botones grandes, fondo oscuro
 * translúcido, sin toques accidentales en la zona central (área "no tocar").
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useAnimatedReaction, runOnJS } from "react-native-reanimated";
import { colors, spacing, radius } from "@/theme/colors";
import type { RepPhase, RepSummary } from "@/modules/biomechanics/repStateMachine";
import type { DetectedFault } from "@/modules/biomechanics/faultDetector";

interface RepCounterHUDProps {
  count: number;
  angle: number;
  phase: RepPhase;
  lastRep: RepSummary | null;
  faults: DetectedFault[];
  targetReps: number;
  onFinishSet: () => void;
  onDiscardRep: () => void;
}

const PHASE_LABEL: Record<RepPhase, string> = {
  IDLE: "Listo",
  ECCENTRIC: "Bajando",
  BOTTOM_CONTRACTED: "Abajo",
  CONCENTRIC: "Subiendo",
  TOP_LOCKED: "Arriba"
};

export const RepCounterHUD: React.FC<RepCounterHUDProps> = ({
  count, angle, phase, lastRep, faults, targetReps, onFinishSet, onDiscardRep
}) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Top row: count + angle + phase */}
      <View style={styles.topRow} pointerEvents="none">
        <View style={styles.countCard}>
          <Text style={styles.countNumber}>{count}</Text>
          <Text style={styles.countLabel}>REPS</Text>
          {targetReps > 0 && (
            <Text style={styles.countTarget}>/ {targetReps}</Text>
          )}
        </View>
        <View style={styles.rightStats}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>ÁNGULO</Text>
            <Text style={styles.statValue}>{Math.round(angle)}°</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>FASE</Text>
            <Text style={[styles.statValue, { color: phaseColor(phase) }]}>
              {PHASE_LABEL[phase]}
            </Text>
          </View>
          {lastRep && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>TEMPO</Text>
              <Text style={styles.statValue}>
                {(lastRep.eccentricMs / 1000).toFixed(1)}s / {(lastRep.concentricMs / 1000).toFixed(1)}s
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Middle: faults (justo encima del botón) */}
      {faults.length > 0 && (
        <View style={styles.faultsCard} pointerEvents="none">
          {faults.slice(0, 3).map((f, i) => (
            <Text
              key={i}
              style={[
                styles.faultText,
                { color: f.severity === "error" ? colors.error : colors.warning }
              ]}
            >
              {f.message}
            </Text>
          ))}
        </View>
      )}

      {/* Bottom buttons */}
      <View style={styles.bottomRow}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onDiscardRep}>
          <Text style={styles.btnSecondaryText}>Descartar última</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onFinishSet}>
          <Text style={styles.btnPrimaryText}>Terminar serie</Text>
        </Pressable>
      </View>
    </View>
  );
};

function phaseColor(p: RepPhase): string {
  switch (p) {
    case "ECCENTRIC": return colors.eccentric;
    case "BOTTOM_CONTRACTED": return colors.bottom;
    case "CONCENTRIC": return colors.concentric;
    default: return colors.ok;
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    justifyContent: "space-between"
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl
  },
  countCard: {
    backgroundColor: "rgba(8, 10, 14, 0.85)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dim,
    minWidth: 120,
    alignItems: "center"
  },
  countNumber: {
    color: colors.bright,
    fontSize: 56,
    fontWeight: "800",
    lineHeight: 64
  },
  countLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700"
  },
  countTarget: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2
  },
  rightStats: {
    backgroundColor: "rgba(8, 10, 14, 0.85)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dim,
    minWidth: 160,
    gap: 6
  },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  statValue: { color: colors.bright, fontSize: 16, fontWeight: "700" },
  faultsCard: {
    backgroundColor: "rgba(8, 10, 14, 0.92)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    gap: 4,
    marginBottom: spacing.md
  },
  faultText: {
    fontSize: 14,
    fontWeight: "700"
  },
  bottomRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.dim },
  btnPrimaryText: { color: "#08080c", fontSize: 17, fontWeight: "800" },
  btnSecondaryText: { color: colors.textMuted, fontSize: 15, fontWeight: "700" }
});
