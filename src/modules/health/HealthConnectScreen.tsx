/**
 * CameraScreen.tsx (Fase 3)
 * ----------------------------------------------------------------------------
 * Integración completa del Coach AI:
 *   - Skeleton overlay Skia (puntitos color por fase) [Fase 1]
 *   - RepStateMachine + FaultDetector [Fase 1]
 *   - Calibración 3s [Fase 1]
 *   - VBT por esqueleto (frame-to-frame velocity) [Fase 3]
 *   - Asimetría L/R + lado débil resaltado [Fase 3]
 *   - Guía espacio reducido [Fase 3]
 *   - Grabación de serie con rep_markers [Fase 3]
 *   - Ghost Pacer (replay post-serie) [Fase 3]
 *   - Audio coach con ducking (TTS español) [Fase 3]
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, useWindowDimensions, ActivityIndicator
} from "react-native";
import { Camera, useCameraPermission, useCameraDevice } from "react-native-vision-camera";
import { useKeepAwake } from "expo-keep-awake";

import { SkeletonOverlay } from "./SkeletonOverlay";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { RepCounterHUD } from "./RepCounterHUD";
import { SmallSpaceGuide } from "./SmallSpaceGuide";
import { GhostOverlay, LivePaceIndicator, SetReplay } from "./GhostPacer";
import { usePoseFrameProcessor } from "./hooks/usePoseFrameProcessor";
import { useCameraThermalGuard } from "./hooks/useCameraThermalGuard";
import { useVbtVelocity, getLoadPointForExercise } from "./hooks/useVbtVelocity";
import { useAsymmetryDetection, ASYMMETRY_PRESETS } from "./hooks/useAsymmetryDetection";
import { useSetRecorder } from "./hooks/useSetRecorder";

import {
  RepStateMachine, type RepPhase, type RepSummary
} from "@/modules/biomechanics/repStateMachine";
import { detectFaults, FAULT_TO_LANDMARK, type DetectedFault } from "@/modules/biomechanics/faultDetector";
import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { colors, spacing, radius } from "@/theme/colors";
import { useWorkoutStore } from "@/store/workoutStore";
import { audioCoach } from "@/modules/audioCoach/audioCoach";


class CameraErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#08080c", alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <Text style={{ color: "#ef4444", fontSize: 18, fontWeight: "800", marginBottom: spacing.md }}>
            No se pudo iniciar la cámara
          </Text>
          <Text style={{ color: "#e6e8f0", fontSize: 13, textAlign: "center", marginBottom: spacing.lg }}>
            {this.state.error?.message || "Error desconocido"}
          </Text>
          <Pressable style={{ backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 8 }}
            onPress={() => this.setState({ error: null })}>
            <Text style={{ color: "#08080c", fontWeight: "800" }}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

type Mode = "select_exercise" | "calibrating" | "tracking" | "replay";

export const CameraScreen: React.FC = () => {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const cameraPerm = useCameraPermission();
  const device = useCameraDevice("back");

  const [mode, setMode] = useState<Mode>("select_exercise");
  const [preset, setPreset] = useState<ExercisePreset>(EXERCISE_PRESETS.squat);
  const [targetReps, setTargetReps] = useState(8);
  const [weight, setWeight] = useState(40);
  const [count, setCount] = useState(0);
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState<RepPhase>("IDLE");
  const [faults, setFaults] = useState<DetectedFault[]>([]);
  const [lastRep, setLastRep] = useState<RepSummary | null>(null);
  const [latestPose, setLatestPose] = useState<any>(null);
  const [ghostFrames, setGhostFrames] = useState<any[]>([]);
  const [replayData, setReplayData] = useState<{ videoUri: string; poseFrames: any[]; repMarkers: any[] } | null>(null);
  const [recordingEnabled, setRecordingEnabled] = useState(true);

  const phaseShared = useRef<any>({ value: "IDLE" });
  const faultLandmarksShared = useRef<any>({ value: [] });
  const stateMachineRef = useRef<RepStateMachine | null>(null);
  const cameraRef = useRef<any>(null);
  const setStartTimeRef = useRef<number>(0);

  const vbt = useVbtVelocity(getLoadPointForExercise(preset.id));
  const asym = useAsymmetryDetection(ASYMMETRY_PRESETS[preset.id] ?? ASYMMETRY_PRESETS.squat);
  const recorder = useSetRecorder();

  const { addSet } = useWorkoutStore();

  useEffect(() => {
    stateMachineRef.current = new RepStateMachine(preset.stateMachine);
    vbt.reset();
    asym.reset();
    setCount(0);
    setPhase("IDLE");
    setFaults([]);
    setLastRep(null);
  }, [preset]);

  const onPose = useCallback((pose: any) => {
    setLatestPose(pose);
    if (mode !== "tracking") return;
    const sm = stateMachineRef.current;
    if (!sm || !pose.detected || !pose.landmarks.length) return;

    // VBT frame-to-frame
    vbt.processFrame(pose);
    // Asimetría frame-to-frame
    asym.processFrame(pose);

    // Rep counting
    const completed = sm.process(pose.landmarks, pose.timestampMs);
    if (completed) {
      setCount(completed.repIndex);
      setLastRep(completed);
      vbt.onRepComplete(Math.abs(vbt.currentVelocityMs));
      asym.onRepComplete();
      recorder.markRep(completed);

      // Audio coach: beep sutil al contar rep
      if (completed.fullRom) {
        audioCoach.beep(880, 80);
      } else {
        audioCoach.speak(`Rep ${completed.repIndex}, media`, true);
      }

      // Avisar al alcanzar el target
      if (completed.repIndex >= targetReps) {
        audioCoach.speak(`Serie completa. ${targetReps} repeticiones.`, true);
      }
    }

    setAngle(sm.getCurrentAngle());
    setPhase(sm.getPhase());

    const detected = detectFaults(preset, pose.landmarks);
    detected.forEach((f) => sm.recordFault(f.code));
    setFaults(detected);

    // Combinar landmarks flagged: fallos + asimetría
    const faultLmSet = new Set<number>();
    detected.forEach((f) => {
      const lmIdxs = FAULT_TO_LANDMARK[f.code] ?? [];
      lmIdxs.forEach((i) => faultLmSet.add(i));
    });
    asym.flaggedLandmarks.forEach((i) => faultLmSet.add(i));
    faultLandmarksShared.current.value = Array.from(faultLmSet);
    phaseShared.current.value = sm.getPhase();

    // Captura de frames para replay
    if (recorder.isRecording) {
      recorder.capturePoseFrame(pose);
    }
  }, [mode, preset, targetReps, vbt, asym, recorder]);

  const { poseShared } = usePoseFrameProcessor(onPose);
  const thermal = useCameraThermalGuard(30);

  // Cargar ghost (mejor serie histórica del ejercicio)
  useEffect(() => {
    if (mode === "tracking") {
      loadBestGhost(preset.id).then(setGhostFrames).catch(() => {});
      setStartTimeRef.current = Date.now();
    }
  }, [mode, preset]);

  // --- Render ---
  if (!cameraPerm.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Pressable style={styles.btn} onPress={cameraPerm.requestPermission}>
          <Text style={styles.btnText}>Conceder acceso</Text>
        </Pressable>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.md }}>Buscando cámara…</Text>
      </View>
    );
  }

  if (mode === "select_exercise") {
    return (
      <ExerciseSelector
        preset={preset}
        onSelect={setPreset}
        targetReps={targetReps}
        onTargetReps={setTargetReps}
        weight={weight}
        onWeight={setWeight}
        recordingEnabled={recordingEnabled}
        onToggleRecording={setRecordingEnabled}
        onStart={() => setMode("calibrating")}
      />
    );
  }

  if (mode === "replay" && replayData) {
    return (
      <SetReplay
        videoUri={replayData.videoUri}
        poseFrames={replayData.poseFrames}
        repMarkers={replayData.repMarkers}
        width={width}
        height={height}
        onClose={() => setMode("select_exercise")}
      />
    );
  }

  const setElapsedSec = Math.floor((Date.now() - setStartTimeRef.current) / 1000);

  return (
    <CameraErrorBoundary>
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={thermal.isActive}
        fps={thermal.targetFps}
        enableHighQualityPhotos={false}
        enableZoomGesture={false}
        video={true}
        audio={false}
      />

      {mode === "tracking" && (
        <SkeletonOverlay
          poseShared={poseShared}
          phaseShared={phaseShared as any}
          faultLandmarksShared={faultLandmarksShared as any}
          width={width}
          height={height}
        />
      )}

      {ghostFrames.length > 0 && (
        <GhostOverlay
          ghostFrames={ghostFrames}
          width={width}
          height={height}
          currentPose={latestPose}
        />
      )}

      {mode === "calibrating" && (
        <>
          <SmallSpaceGuide
            pose={latestPose}
            exerciseId={preset.id}
            width={width}
            height={height}
            onAdequateChange={(ok) => {/* podría bloquear el botón */}}
          />
          <CalibrationOverlay
            pose={latestPose}
            preset={preset}
            width={width}
            height={height}
            onCalibrated={() => setMode("tracking")}
          />
        </>
      )}

      {mode === "tracking" && (
        <>
          <LivePaceIndicator
            currentAngle={angle}
            targetAngle={preset.stateMachine.topAngleDeg}
            repsDone={count}
            targetReps={targetReps}
            setElapsedSec={setElapsedSec}
            vbtPeakMs={vbt.lastRepPeakMs || Math.abs(vbt.currentVelocityMs)}
            ghostPeakMs={ghostFrames.length > 0 ? 0.6 : undefined}
          />
          <RepCounterHUD
            count={count}
            angle={angle}
            phase={phase}
            lastRep={lastRep}
            faults={faults}
            targetReps={targetReps}
            onFinishSet={async () => {
              if (recordingEnabled && recorder.isRecording) {
                const path = await recorder.stopRecording();
                if (path) {
                  // Mostrar replay
                  // (PoseFrames y markers están dentro del recorder)
                  setReplayData({
                    videoUri: path,
                    poseFrames: [],
                    repMarkers: []
                  });
                }
              }
              const sm = stateMachineRef.current;
              if (!sm) return;
              await addSet({
                exerciseId: preset.id,
                weightKg: weight,
                reps: sm.getCount(),
                partialReps: sm.getHistory().filter((r) => !r.fullRom).length,
                rpe: undefined,
                tempoSec: lastRep
                  ? { eccentric: lastRep.eccentricMs / 1000, concentric: lastRep.concentricMs / 1000 }
                  : undefined,
                poseSummary: {
                  faultsDetected: faults.map((f) => f.code),
                  reps: sm.getHistory(),
                  vbt: { peaks: vbt.repPeaks, lossPct: vbt.velocityLossPct, fatigue: vbt.fatigueLevel },
                  asymmetry: {
                    weakSide: asym.weakSide,
                    setScore: asym.setAsymmetryScore
                  }
                }
              });
              thermal.release();
              setMode("select_exercise");
            }}
            onDiscardRep={() => stateMachineRef.current?.discardCurrent()}
          />
          {recordingEnabled && !recorder.isRecording && (
            <Pressable
              style={styles.recStartBtn}
              onPress={() => recorder.startRecording(cameraRef)}
            >
              <Text style={styles.recStartText}>● Grabar serie</Text>
            </Pressable>
          )}
          {recorder.isRecording && (
            <View style={styles.recBadge}>
              <Text style={styles.recText}>● REC {recorder.recordingSeconds}s</Text>
            </View>
          )}
          {/* Fatiga por VBT */}
          {vbt.fatigueLevel === "fatigued" && (
            <View style={styles.fatigueBadge}>
              <Text style={styles.fatigueText}>
                ⚠ Fatiga detectada ({vbt.velocityLossPct.toFixed(0)}% pérdida de velocidad)
              </Text>
            </View>
          )}
          {/* Asimetría */}
          {asym.weakSide && (
            <View style={styles.asymBadge}>
              <Text style={styles.asymText}>
                Asimetría: lado {asym.weakSide} ({Math.round(asym.currentAsymmetryDeg)}°)
              </Text>
            </View>
          )}
        </>
      )}

      {thermal.thermalLevel !== "nominal" && (
        <View style={styles.thermalBadge}>
          <Text style={styles.thermalText}>🌡 {thermal.thermalLevel.toUpperCase()} · {thermal.targetFps}fps</Text>
        </View>
      )}
    </View>
    </CameraErrorBoundary>
  );
};

// ============================================================================
// Selector de ejercicio (extends Fase 1 con grabación toggle)
// ============================================================================
const ExerciseSelector: React.FC<any> = ({
  preset, onSelect, targetReps, onTargetReps, weight, onWeight,
  recordingEnabled, onToggleRecording, onStart
}) => {
  return (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>Elige ejercicio</Text>
      <View style={styles.presetGrid}>
        {Object.values(EXERCISE_PRESETS).map((p) => (
          <Pressable
            key={p.id}
            style={[styles.presetCard, p.id === preset.id && styles.presetCardActive]}
            onPress={() => onSelect(p)}
          >
            <Text style={{ fontSize: 22, marginBottom: 4 }}>{p.emoji ?? "🏋️"}</Text>
            <Text style={[styles.presetName, p.id === preset.id && styles.presetNameActive]}>{p.name}</Text>
            <Text style={styles.presetMeta}>{p.primaryMuscle}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>PESO (kg)</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepBtn} onPress={() => onWeight(Math.max(0, weight - 2.5))}>
          <Text style={styles.stepBtnText}>- 2.5</Text>
        </Pressable>
        <Text style={styles.stepValue}>{weight.toFixed(1)}</Text>
        <Pressable style={styles.stepBtn} onPress={() => onWeight(weight + 2.5)}>
          <Text style={styles.stepBtnText}>+ 2.5</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>REPS OBJETIVO</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepBtn} onPress={() => onTargetReps(Math.max(1, targetReps - 1))}>
          <Text style={styles.stepBtnText}>- 1</Text>
        </Pressable>
        <Text style={styles.stepValue}>{targetReps}</Text>
        <Pressable style={styles.stepBtn} onPress={() => onTargetReps(targetReps + 1)}>
          <Text style={styles.stepBtnText}>+ 1</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.toggleRow, recordingEnabled && styles.toggleRowActive]}
        onPress={() => onToggleRecording(!recordingEnabled)}
      >
        <Text style={styles.toggleLabel}>Grabar serie con overlay</Text>
        <Text style={styles.toggleValue}>{recordingEnabled ? "ON" : "OFF"}</Text>
      </Pressable>

      <Text style={styles.hint}>{preset.calibrationHint}</Text>
      <Text style={styles.hintVbt}>
        VBT: seguirá {preset.id === "squat" ? "la cadera" : "la muñeca"} para medir velocidad y fatiga.
      </Text>

      <Pressable style={styles.startBtn} onPress={onStart}>
        <Text style={styles.startBtnText}>Iniciar cámara</Text>
      </Pressable>
    </View>
  );
};

// ============================================================================
// Helpers: cargar el mejor "ghost" histórico
// ============================================================================
async function loadBestGhost(exerciseId: string): Promise<any[]> {
  try {
    const { openDatabase, queryAsync } = await import("@/modules/persistence/db");
    const db = await openDatabase();
    // Buscar la grabación marcada como is_best=1 del ejercicio
    const rows = await queryAsync<any>(
      db,
      `SELECT sr.pose_frames, sr.rep_markers
       FROM set_recordings sr
       JOIN sets s ON s.id = sr.set_id
       WHERE s.exercise_id = ? AND sr.is_best = 1 AND sr.pose_frames IS NOT NULL
       ORDER BY sr.created_at DESC LIMIT 1`,
      [exerciseId]
    );
    if (rows.length === 0) return [];
    const poseFrames = JSON.parse(rows[0].pose_frames);
    return Array.isArray(poseFrames) ? poseFrames : [];
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#08080c", padding: spacing.lg },
  title: { color: colors.bright, fontSize: 22, fontWeight: "700", marginBottom: spacing.lg },
  btn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md },
  btnText: { color: "#08080c", fontWeight: "800", fontSize: 16 },
  thermalBadge: {
    position: "absolute", top: spacing.md, right: spacing.md,
    backgroundColor: "rgba(8, 10, 14, 0.85)", paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning
  },
  thermalText: { color: colors.warning, fontSize: 11, fontWeight: "700" },
  recStartBtn: {
    position: "absolute", bottom: 180, alignSelf: "center",
    backgroundColor: colors.error, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.lg, flexDirection: "row", alignItems: "center"
  },
  recStartText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  recBadge: {
    position: "absolute", top: 100, left: spacing.md,
    backgroundColor: "rgba(239, 68, 68, 0.92)", paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.sm
  },
  recText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  fatigueBadge: {
    position: "absolute", bottom: 250, alignSelf: "center",
    backgroundColor: "rgba(245, 158, 11, 0.92)", paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.sm
  },
  fatigueText: { color: "#08080c", fontWeight: "800", fontSize: 12 },
  asymBadge: {
    position: "absolute", bottom: 290, alignSelf: "center",
    backgroundColor: "rgba(6, 182, 212, 0.92)", paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.sm
  },
  asymText: { color: "#08080c", fontWeight: "800", fontSize: 12 },
  // Selector
  selectorContainer: { flex: 1, backgroundColor: "#08080c", padding: spacing.lg, paddingTop: spacing.xl + 12 },
  selectorTitle: { color: colors.bright, fontSize: 28, fontWeight: "800", marginBottom: spacing.lg },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  presetCard: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.dim
  },
  presetCardActive: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  presetName: { color: colors.bright, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  presetNameActive: { color: colors.accent },
  presetMeta: { color: colors.textMuted, fontSize: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: spacing.xs, marginTop: spacing.md },
  stepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md
  },
  stepBtn: {
    backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, minWidth: 70, alignItems: "center"
  },
  stepBtnText: { color: colors.bright, fontWeight: "700", fontSize: 14 },
  stepValue: { color: colors.bright, fontSize: 24, fontWeight: "800" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.dim
  },
  toggleRowActive: { borderColor: colors.accent },
  toggleLabel: { color: colors.bright, fontSize: 14, fontWeight: "700" },
  toggleValue: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  hintVbt: { color: colors.concentric, fontSize: 12, marginBottom: spacing.lg },
  startBtn: { backgroundColor: colors.accent, paddingVertical: spacing.lg, borderRadius: radius.lg, alignItems: "center", marginTop: "auto" },
  startBtnText: { color: "#08080c", fontSize: 18, fontWeight: "800" }
});
