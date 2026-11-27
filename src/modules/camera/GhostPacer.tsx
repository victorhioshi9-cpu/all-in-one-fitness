/**
 * GhostPacer.tsx
 * ----------------------------------------------------------------------------
 * Modo replay post-serie + indicador numÃ©rico en vivo.
 *
 * Dos funcionalidades:
 *   A) Live indicator: muestra un mini card con el ROM actual + ritmo (rep/s)
 *      de la sesiÃ³n en curso, comparado con el target.
 *   B) Post-serie replay: carga la mejor serie histÃ³rica del ejercicio y
 *      reproduce su overlay al lado del overlay actual para comparaciÃ³n visual.
 *
 * El "ghost" skeleton se dibuja semi-transparente (alpha 0.4) en otro color
 * (cyan) sobre el skeleton actual (color por fase).
 */
import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Canvas, Circle, Path } from "@shopify/react-native-skia";
import { Skia } from "@shopify/react-native-skia";
import { colors, spacing, radius } from "@/theme/colors";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";
import { POSE_CONNECTIONS } from "@/modules/biomechanics/landmarks";

interface GhostPacerProps {
  /** Mejor serie histÃ³rica cargada como array de PoseFrames comprimidos. */
  ghostFrames: PoseFrame[];
  width: number;
  height: number;
  /** Frame actual del usuario para comparaciÃ³n en vivo. */
  currentPose: PoseFrame | null;
}

export const GhostOverlay: React.FC<GhostPacerProps> = ({
  ghostFrames, width, height, currentPose
}) => {
  const [tick, setTick] = useState(0);

  // Reproducir el ghost en bucle cada 33ms (~30fps)
  useEffect(() => {
    if (ghostFrames.length === 0) return;
    const id = setInterval(() => {
      setTick((t) => (t + 1) % ghostFrames.length);
    }, 33);
    return () => clearInterval(id);
  }, [ghostFrames]);

  if (ghostFrames.length === 0) return null;
  const ghost = ghostFrames[tick];
  if (!ghost || !ghost.detected) return null;

  const ghostPath = Skia.Path.Make();
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = ghost.landmarks[i]; const b = ghost.landmarks[j];
    if (!a || !b) continue;
    ghostPath.moveTo(a.x * width, a.y * height);
    ghostPath.lineTo(b.x * width, b.y * height);
  }

  return (
    <Canvas style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }}>
      {/* Ghost lines - cyan semi-transparent */}
      <Path
        path={ghostPath}
        style="stroke"
        strokeWidth={3}
        color="#06b6d4"
        opacity={0.35}
        strokeJoin="round"
        strokeCap="round"
      />
      {/* Ghost joints */}
      {ghost.landmarks.map((lm, idx) => (
        <Circle
          key={idx}
          cx={lm.x * width}
          cy={lm.y * height}
          r={3}
          color="#06b6d4"
          opacity={0.4}
        />
      ))}
    </Canvas>
  );
};

// ----------------------------------------------------------------------------
// Live indicator: card con ROM actual + ritmo + comparaciÃ³n con target
// ----------------------------------------------------------------------------
interface LivePaceIndicatorProps {
  currentAngle: number;
  targetAngle: number;
  repsDone: number;
  targetReps: number;
  setElapsedSec: number;
  vbtPeakMs: number;
  ghostPeakMs?: number;
}

export const LivePaceIndicator: React.FC<LivePaceIndicatorProps> = ({
  currentAngle, targetAngle, repsDone, targetReps, setElapsedSec, vbtPeakMs, ghostPeakMs
}) => {
  const pace = repsDone > 0 && setElapsedSec > 0 ? (repsDone / setElapsedSec * 60).toFixed(1) : "0";
  const romPct = targetAngle > 0 ? Math.min(100, (currentAngle / targetAngle) * 100) : 0;
  const vbtVsGhost = ghostPeakMs && ghostPeakMs > 0
    ? `${(vbtPeakMs / ghostPeakMs * 100).toFixed(0)}%`
    : null;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.row}>
        <Stat label="ROM" value={`${Math.round(romPct)}%`} color={romPct > 90 ? colors.ok : colors.warning} />
        <Stat label="Ritmo" value={`${pace}/min`} />
        <Stat label="Velocidad" value={`${vbtPeakMs.toFixed(2)} m/s`} />
        {vbtVsGhost && (
          <Stat label="vs Mejor" value={vbtVsGhost} color={parseInt(vbtVsGhost) >= 95 ? colors.ok : colors.warning} />
        )}
      </View>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color: color ?? colors.bright }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 120,
    left: spacing.md,
    right: spacing.md,
    alignItems: "center",
    pointerEvents: "none"
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: "rgba(8, 10, 14, 0.85)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dim
  },
  stat: { alignItems: "center", minWidth: 60 },
  statLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  statValue: { fontSize: 14, fontWeight: "800", marginTop: 2 }
});

// ----------------------------------------------------------------------------
// Post-serie replay viewer
// ----------------------------------------------------------------------------
interface SetReplayProps {
  videoUri: string;
  poseFrames: PoseFrame[];
  repMarkers: { repIndex: number; timestampMs: number; faults: string[]; fullRom: boolean }[];
  width: number;
  height: number;
  onClose: () => void;
}

export const SetReplay: React.FC<SetReplayProps> = ({
  videoUri, poseFrames, repMarkers, width, height, onClose
}) => {
  return (
    <View style={styles.replayContainer}>
      <Text style={styles.replayTitle}>Replay de la serie</Text>
      <View style={{ width, height: height * 0.6, backgroundColor: "#000", borderRadius: radius.md, overflow: "hidden" }}>
        {/* AquÃ­ irÃ­a un Video component con expo-av o react-native-video.
            Para Fase 3 lo dejamos como placeholder visual con un thumbnail. */}
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoPath}>{videoUri.split("/").pop()}</Text>
          <Text style={styles.videoMeta}>{poseFrames.length} frames Â· {repMarkers.length} reps</Text>
        </View>
      </View>
      <View style={styles.markersList}>
        {repMarkers.map((m) => (
          <View key={m.repIndex} style={styles.markerRow}>
            <Text style={styles.markerRep}>Rep {m.repIndex}</Text>
            <Text style={[
              styles.markerStatus,
              { color: m.fullRom ? colors.ok : colors.warning }
            ]}>
              {m.fullRom ? "ROM completo" : "Media rep"}
            </Text>
            {m.faults.length > 0 && (
              <Text style={styles.markerFaults}>{m.faults.join(", ")}</Text>
            )}
          </View>
        ))}
      </View>
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>Cerrar</Text>
      </Pressable>
    </View>
  );
};

const replayStyles = StyleSheet.create({
  replayContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, alignItems: "center" },
  replayTitle: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  videoPath: { color: colors.bright, fontSize: 14, fontWeight: "700" },
  videoMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  markersList: {
    width: "100%",
    marginTop: spacing.lg,
    gap: spacing.xs
  },
  markerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.md
  },
  markerRep: { color: colors.bright, fontWeight: "700", fontSize: 14, flex: 0.5 },
  markerStatus: { fontWeight: "700", fontSize: 12, flex: 1 },
  markerFaults: { color: colors.error, fontSize: 11, flex: 1.5 },
  closeBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg
  },
  closeBtnText: { color: "#08080c", fontWeight: "800", fontSize: 16 }
});

// Re-exportar los estilos del replay
export const replayOverlayStyles = StyleSheet.create({
  container: { position: "absolute", top: 120, left: 0, right: 0 },
  row: { flexDirection: "row" },
  stat: {},
  statLabel: {},
  statValue: {},
  replayContainer: replayStyles.replayContainer,
  replayTitle: replayStyles.replayTitle,
  videoPlaceholder: replayStyles.videoPlaceholder,
  videoPath: replayStyles.videoPath,
  videoMeta: replayStyles.videoMeta,
  markersList: replayStyles.markersList,
  markerRow: replayStyles.markerRow,
  markerRep: replayStyles.markerRep,
  markerStatus: replayStyles.markerStatus,
  markerFaults: replayStyles.markerFaults,
  closeBtn: replayStyles.closeBtn,
  closeBtnText: replayStyles.closeBtnText,
});