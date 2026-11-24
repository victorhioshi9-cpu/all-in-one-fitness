/**
 * CameraScreen.tsx (Rediseño v0.4)
 * ----------------------------------------------------------------------------
 * Integración completa del Coach AI con:
 *   - Skeleton overlay Skia (puntitos color por fase) [Fase 1]
 *   - RepStateMachine + FaultDetector [Fase 1]
 *   - Calibración 3s [Fase 1]
 *   - VBT por esqueleto (frame-to-frame velocity) [Fase 3]
 *   - Asimetría L/R + lado débil resaltado [Fase 3]
 *   - Guía espacio reducido [Fase 3]
 *   - Grabación de serie con rep_markers [Fase 3]
 *   - Ghost Pacer (replay post-serie) [Fase 3]
 *   - Audio coach con ducking (TTS español) [Fase 3]
 *
 * BUG FIX (v0.4): `phaseShared` y `faultLandmarksShared` se creaban con
 *   `useRef<any>({ value: ... })`, pero `SkeletonOverlay` los consume como
 *   `SharedValue<T>` accediendo a `.value` directamente. Esto causaba
 *   `undefined.includes(idx)` y crash al iniciar la cámara.
 *   Sustituido por `useSharedValue<T>(initialValue)` de react-native-reanimated
 *   y actualizadas todas las lecturas/escrituras (.current.value -> .value).
 *
 * Rediseño del selector de ejercicio (v0.4):
 *   - ScrollView vertical con cabeceras por categoría (free_weight, machine,
 *     calisthenic, cardio) y grid de 2 columnas dentro de cada categoría.
 *   - Tarjetas con emoji grande, nombre, músculo primario y franja de color
 *     por categoría a la izquierda.
 *   - Steppers de peso/reps con touch targets grandes (>= 56px).
 *   - Hint de calibración + VBT visible antes de iniciar cámara.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, useWindowDimensions, ActivityIndicator,
  ScrollView, FlatList, Linking, Alert
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
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

type Mode = "select_exercise" | "calibrating" | "tracking" | "replay";

// Categorías en orden visual fijo para el selector
type ExerciseCategory = ExercisePreset["category"];
const CATEGORY_ORDER: ExerciseCategory[] = ["free_weight", "machine", "cable", "calisthenic", "cardio"];
const CATEGORY_META: Record<ExerciseCategory, { label: string; emoji: string; color: string }> = {
  free_weight: { label: "Pesas libres", emoji: "🏋️", color: colors.accent },
  machine: { label: "Máquinas", emoji: "🛠️", color: colors.concentric },
  cable: { label: "Poleas / cables", emoji: "🔗", color: colors.bottom },
  calisthenic: { label: "Calistenia", emoji: "🤸", color: colors.ok },
  cardio: { label: "Cardio", emoji: "🔥", color: colors.error }
};

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

  // BUG FIX: antes useRef<any>({value: ...}) -> ahora SharedValue real.
  const phaseShared = useSharedValue<RepPhase>("IDLE");
  const faultLandmarksShared = useSharedValue<number[]>([]);
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
    // Resetea SharedValues al cambiar de ejercicio
    phaseShared.value = "IDLE";
    faultLandmarksShared.value = [];
  }, [preset, vbt, asym, phaseShared, faultLandmarksShared]);

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

    // BUG FIX: escritura directa sobre el SharedValue (sin .current).
    faultLandmarksShared.value = Array.from(faultLmSet);
    phaseShared.value = sm.getPhase();

    // Captura de frames para replay
    if (recorder.isRecording) {
      recorder.capturePoseFrame(pose);
    }
  }, [mode, preset, targetReps, vbt, asym, recorder, phaseShared, faultLandmarksShared]);

  const { poseShared } = usePoseFrameProcessor(onPose);
  const thermal = useCameraThermalGuard(30);

  // Cargar ghost (mejor serie histórica del ejercicio)
  useEffect(() => {
    if (mode === "tracking") {
      loadBestGhost(preset.id).then(setGhostFrames).catch(() => {});
      setStartTimeRef.current = Date.now();
    }
  }, [mode, preset]);

  // --- Manejador de permiso de cámara ---
  // BUGFIX (v0.3.2): Antes se pasaba `cameraPerm.requestPermission` directamente
  // al onPress del Pressable. Eso causaba 3 problemas:
  //   1. Pressable pasa un PressEvent como argumento; requestPermission no lo espera
  //      y en algunos dispositivos la llamada falla silenciosamente.
  //   2. La Promise devuelta por requestPermission no se awaited ni catch'eaba →
  //      unhandled rejection silencioso.
  //   3. Si el usuario denegó 2 veces en Android 13+, el diálogo ya no aparece
  //      (permiso "permanentemente denegado") y la UI no ofrecía fallback para
  //      abrir Ajustes → la app se quedaba pegada en esta pantalla.
  // Ahora envolvemos en una función async con try/catch, comprobamos si tras
  // pedir el permiso sigue sin concederse (caso permanentemente denegado) y
  // ofrecemos un Alert con botón para abrir Ajustes del sistema.
  const handleRequestCameraPermission = useCallback(async () => {
    try {
      const granted = await cameraPerm.requestPermission();
      // En react-native-vision-camera v4.5, requestPermission() devuelve boolean.
      // Si tras pedir el permiso sigue sin concederse, lo más probable es que
      // el usuario lo haya denegado 2 veces en Android 13+ y el diálogo ya no
      // aparezca (permiso "permanentemente denegado").
      if (!granted) {
        Alert.alert(
          "Permiso de cámara bloqueado",
          "Has denegado el permiso de cámara varias veces. Android ya no muestra el diálogo.\n\n" +
          "Para concederlo, abre Ajustes → Aplicaciones → All-in-One Fitness → Permisos → Cámara → Permitir.",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Abrir Ajustes",
              style: "default",
              onPress: () => {
                Linking.openSettings().catch(() => {});
              }
            }
          ]
        );
      }
      // Si granted === true, el hook useCameraPermission actualizará
      // hasPermission y el componente se re-renderizará automáticamente.
    } catch (err: any) {
      console.error("[CameraScreen] requestPermission error:", err);
      Alert.alert(
        "No se pudo pedir el permiso",
        "Ocurrió un error al solicitar el permiso de cámara: " + (err?.message ?? String(err)),
        [
          { text: "OK", style: "default" },
          {
            text: "Abrir Ajustes",
            style: "default",
            onPress: () => Linking.openSettings().catch(() => {})
          }
        ]
      );
    }
  }, [cameraPerm]);

  // --- Render ---
  if (!cameraPerm.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Text style={styles.hint}>
          La cámara se usa solo dentro de esta app para detectar tu postura en
          tiempo real. El video nunca sale del dispositivo.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={handleRequestCameraPermission}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.btnText}>Conceder acceso</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.06)", marginTop: spacing.sm }]}
          onPress={() => Linking.openSettings().catch(() => {})}
        >
          <Text style={[styles.btnText, { color: colors.bright }]}>Abrir Ajustes</Text>
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

      <SkeletonOverlay
        poseShared={poseShared}
        phaseShared={phaseShared}
        faultLandmarksShared={faultLandmarksShared}
        width={width}
        height={height}
      />

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
  );
};

// ============================================================================
// Selector de ejercicio (rediseñado v0.4)
// - ScrollView vertical con cabeceras por categoría.
// - Grid de 2 columnas dentro de cada sección (FlatList anidado).
// - Tarjetas con emoji grande + nombre + músculo + franja de color.
// - Steppers grandes (>= 56px de touch target).
// ============================================================================
interface ExerciseSelectorProps {
  preset: ExercisePreset;
  onSelect: (p: ExercisePreset) => void;
  targetReps: number;
  onTargetReps: (n: number) => void;
  weight: number;
  onWeight: (n: number) => void;
  recordingEnabled: boolean;
  onToggleRecording: (b: boolean) => void;
  onStart: () => void;
}

const ExerciseSelector: React.FC<ExerciseSelectorProps> = ({
  preset, onSelect, targetReps, onTargetReps, weight, onWeight,
  recordingEnabled, onToggleRecording, onStart
}) => {
  // Agrupa presets por categoría en el orden visual definido.
  const byCategory = React.useMemo(() => {
    const all = Object.values(EXERCISE_PRESETS);
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      meta: CATEGORY_META[cat],
      items: all.filter((p) => p.category === cat)
    })).filter((g) => g.items.length > 0);
  }, []);

  return (
    <ScrollView
      style={styles.selectorScroll}
      contentContainerStyle={styles.selectorContainer}
      showsVerticalScrollIndicator
    >
      <Text style={styles.selectorTitle}>Coach AI</Text>
      <Text style={styles.selectorSubtitle}>Elige ejercicio para iniciar cámara</Text>

      {/* Resumen del ejercicio seleccionado */}
      <View style={styles.selectedSummaryCard}>
        <Text style={styles.selectedEmoji}>{preset.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName}>{preset.name}</Text>
          <Text style={styles.selectedMuscle}>{preset.primaryMuscle}</Text>
        </View>
        <View style={[styles.selectedStripe, { backgroundColor: CATEGORY_META[preset.category].color }]} />
      </View>

      {/* Steppers grandes */}
      <Text style={styles.sectionLabel}>PESO (kg)</Text>
      <BigStepper
        onDec={() => onWeight(Math.max(0, +(weight - 2.5).toFixed(1)))}
        onInc={() => onWeight(+(weight + 2.5).toFixed(1))}
        stepLabel="2.5"
        displayValue={weight.toFixed(1)}
      />

      <Text style={styles.sectionLabel}>REPS OBJETIVO</Text>
      <BigStepper
        onDec={() => onTargetReps(Math.max(1, targetReps - 1))}
        onInc={() => onTargetReps(targetReps + 1)}
        stepLabel="1"
        displayValue={String(targetReps)}
      />

      {/* Toggle grabación */}
      <Pressable
        style={[styles.toggleRow, recordingEnabled && styles.toggleRowActive]}
        onPress={() => onToggleRecording(!recordingEnabled)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Grabar serie con overlay</Text>
          <Text style={styles.toggleSub}>Guarda el video + esqueleto para replay</Text>
        </View>
        <View style={[styles.togglePill, recordingEnabled && styles.togglePillActive]}>
          <Text style={[styles.toggleValue, recordingEnabled && styles.toggleValueActive]}>
            {recordingEnabled ? "ON" : "OFF"}
          </Text>
        </View>
      </Pressable>

      {/* Catálogo por categorías */}
      <Text style={styles.sectionLabel}>CATÁLOGO</Text>
      {byCategory.map((group) => (
        <View key={group.category} style={styles.categoryBlock}>
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryEmoji}>{group.meta.emoji}</Text>
            <Text style={styles.categoryLabel}>{group.meta.label}</Text>
            <Text style={styles.categoryCount}>{group.items.length}</Text>
          </View>
          <FlatList<ExercisePreset>
            data={group.items}
            numColumns={2}
            scrollEnabled={false}
            keyExtractor={(item: ExercisePreset) => item.id}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={{ paddingBottom: 0 }}
            renderItem={({ item }: { item: ExercisePreset }) => {
              const meta = CATEGORY_META[item.category];
              const active = item.id === preset.id;
              return (
                <Pressable
                  style={[
                    styles.presetCard,
                    active && styles.presetCardActive,
                    { borderColor: active ? meta.color : colors.dim }
                  ]}
                  onPress={() => onSelect(item)}
                >
                  <View style={[styles.presetStripe, { backgroundColor: meta.color }]} />
                  <Text style={styles.presetEmoji}>{item.emoji}</Text>
                  <Text
                    style={[styles.presetName, active && { color: meta.color }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.presetMeta} numberOfLines={1}>{item.primaryMuscle}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      ))}

      {/* Hint de calibración */}
      <View style={styles.hintCard}>
        <Text style={styles.hintEmoji}>🎯</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.hintTitle}>Cómo colocarte</Text>
          <Text style={styles.hintText}>{preset.calibrationHint}</Text>
        </View>
      </View>
      <Text style={styles.hintVbt}>
        VBT: seguirá {preset.id === "squat" ? "la cadera" : "la muñeca"} para medir velocidad y fatiga.
      </Text>

      <Pressable style={styles.startBtn} onPress={onStart}>
        <Text style={styles.startBtnText}>▶ Iniciar cámara</Text>
      </Pressable>
    </ScrollView>
  );
};

// ============================================================================
// Stepper grande (touch target >= 56px)
// ============================================================================
const BigStepper: React.FC<{
  onDec: () => void;
  onInc: () => void;
  stepLabel: string;
  displayValue: string;
}> = ({ onDec, onInc, stepLabel, displayValue }) => (
  <View style={styles.stepperRow}>
    <Pressable
      style={({ pressed }: { pressed: boolean }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
      onPress={onDec}
      hitSlop={8}
    >
      <Text style={styles.stepBtnSign}>−</Text>
      <Text style={styles.stepBtnLabel}>{stepLabel}</Text>
    </Pressable>
    <Text style={styles.stepValue}>{displayValue}</Text>
    <Pressable
      style={({ pressed }: { pressed: boolean }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
      onPress={onInc}
      hitSlop={8}
    >
      <Text style={styles.stepBtnSign}>+</Text>
      <Text style={styles.stepBtnLabel}>{stepLabel}</Text>
    </Pressable>
  </View>
);

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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.lg },
  title: { color: colors.bright, fontSize: 22, fontWeight: "700", marginBottom: spacing.lg },
  btn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    lineHeight: 19
  },
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
  fatigueText: { color: colors.bg, fontWeight: "800", fontSize: 12 },
  asymBadge: {
    position: "absolute", bottom: 290, alignSelf: "center",
    backgroundColor: "rgba(6, 182, 212, 0.92)", paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.sm
  },
  asymText: { color: colors.bg, fontWeight: "800", fontSize: 12 },

  // --- Selector ---
  selectorScroll: { flex: 1, backgroundColor: colors.bg },
  selectorContainer: { padding: spacing.lg, paddingTop: spacing.xl + 12, paddingBottom: spacing.xxl },
  selectorTitle: { color: colors.bright, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  selectorSubtitle: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.lg },

  // Resumen del seleccionado
  selectedSummaryCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.accent
  },
  selectedEmoji: { fontSize: 36 },
  selectedName: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  selectedMuscle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  selectedStripe: { width: 4, height: 36, borderRadius: 2 },

  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: "800",
    letterSpacing: 1.5, marginBottom: spacing.xs, marginTop: spacing.md
  },

  // Stepper grande
  stepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dim
  },
  stepBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.md, minWidth: 80, minHeight: 56,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm
  },
  stepBtnPressed: { backgroundColor: colors.accentDim },
  stepBtnSign: { color: colors.bright, fontSize: 26, fontWeight: "900", lineHeight: 28 },
  stepBtnLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  stepValue: { color: colors.bright, fontSize: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },

  // Toggle grabación
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim
  },
  toggleRowActive: { borderColor: colors.accent },
  toggleLabel: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  toggleSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  togglePill: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  togglePillActive: { backgroundColor: colors.accent },
  toggleValue: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  toggleValueActive: { color: colors.bg },

  // Categorías
  categoryBlock: { marginBottom: spacing.lg },
  categoryHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginBottom: spacing.sm
  },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  categoryCount: {
    color: colors.textMuted, fontSize: 11, fontWeight: "700",
    backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    overflow: "hidden"
  },
  gridRow: { gap: spacing.sm, marginBottom: spacing.sm },

  // Tarjeta de ejercicio
  presetCard: {
    flex: 1, position: "relative",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.dim,
    minHeight: 110, overflow: "hidden"
  },
  presetCardActive: { backgroundColor: "rgba(255,107,53,0.10)" },
  presetStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  presetEmoji: { fontSize: 28, marginBottom: 4 },
  presetName: { color: colors.bright, fontSize: 14, fontWeight: "700", marginBottom: 2, paddingRight: 4 },
  presetMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },

  // Hint
  hintCard: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.dim
  },
  hintEmoji: { fontSize: 24 },
  hintTitle: { color: colors.bright, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  hintText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  hintVbt: { color: colors.concentric, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg },

  startBtn: {
    backgroundColor: colors.accent, paddingVertical: spacing.lg + 2,
    borderRadius: radius.lg, alignItems: "center", marginTop: spacing.sm
  },
  startBtnText: { color: colors.bg, fontSize: 18, fontWeight: "900", letterSpacing: 0.5 }
});
