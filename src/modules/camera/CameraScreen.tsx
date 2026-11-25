/**
 * CameraScreen.tsx — v0.3.6
 * ----------------------------------------------------------------------------
 * Versión con pose detection SIMPLE (sin SharedValue/Skia que rompían toques).
 *
 * Cambios v0.3.6:
 *   - Reactivado pose detection con useSimplePoseFrameProcessor (state normal).
 *   - Overlay SkeletonOverlaySimple (RN puro, sin Skia).
 *   - Contador automático de reps básico (cuenta cuando detecta movimiento
 *     vertical de cadera por encima de umbral).
 *   - Buscador con autoFocus y keyboardShouldPersistTaps.
 *   - Botón "Más" en header para acceder a Perfil/Calendario/etc.
 */
import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions,
  ActivityIndicator, Linking, Alert, TextInput, Keyboard
} from "react-native";
import { Camera, useCameraPermission, useCameraDevice } from "react-native-vision-camera";
import { useKeepAwake } from "expo-keep-awake";

import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { colors, spacing, radius } from "@/theme/colors";
import { useSimplePoseFrameProcessor } from "./hooks/usePoseFrameProcessorSimple";
import { SkeletonOverlaySimple } from "./SkeletonOverlaySimple";

type Mode = "select_exercise" | "tracking";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const cameraRef = useRef<any>(null);

  // --- Pose detection simple ---
  const { pose, fps, frameProcessor } = useSimplePoseFrameProcessor(mode === "tracking");

  // --- Contador automático de reps (heurística simple por altura de cadera) ---
  // Esta es una versión simplificada. Para detección biomecánica real habría
  // que usar RepStateMachine con el preset.stateMachine, pero eso requiere
  // más cálculos. Por ahora: contamos rep cuando la cadera sube más de 0.05
  // en coordenadas normalizadas desde el último mínimo.
  const lastHipYRef = useRef<number | null>(null);
  const repPhaseRef = useRef<"down" | "up">("up");
  const repPeakYRef = useRef<number>(1.0);

  useEffect(() => {
    if (mode !== "tracking") return;
    if (!pose || !pose.detected || !pose.landmarks || pose.landmarks.length < 25) return;

    // Cadera izquierda (landmark 23) o derecha (landmark 24).
    const lh = pose.landmarks[23];
    const rh = pose.landmarks[24];
    if (!lh || !rh) return;
    const hipY = (lh.y + rh.y) / 2;
    if (typeof hipY !== "number") return;

    const last = lastHipYRef.current;
    lastHipYRef.current = hipY;

    if (last === null) {
      repPeakYRef.current = hipY;
      return;
    }

    // Detectar bajada (hipY aumenta) y subida (hipY disminuye).
    if (hipY > last + 0.005) {
      // Bajando: actualizar pico (máximo Y).
      if (hipY > repPeakYRef.current) {
        repPeakYRef.current = hipY;
      }
      repPhaseRef.current = "down";
    } else if (hipY < last - 0.005) {
      // Subiendo.
      if (repPhaseRef.current === "down") {
        // Si hubo una bajada significativa (al menos 0.04 de amplitud), contar rep.
        const amplitude = repPeakYRef.current - hipY;
        if (amplitude > 0.04) {
          setCount((c) => c + 1);
          repPeakYRef.current = hipY;
          repPhaseRef.current = "up";
        }
      }
    }
  }, [pose, mode]);

  // --- Manejador de permiso de cámara ---
  const handleRequestCameraPermission = async () => {
    try {
      const granted = await cameraPerm.requestPermission();
      if (!granted) {
        Alert.alert(
          "Permiso de cámara bloqueado",
          "Has denegado el permiso de cámara varias veces. Android ya no muestra el diálogo.\n\n" +
          "Para concederlo, abre Ajustes → Aplicaciones → All-in-One Fitness → Permisos → Cámara → Permitir.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir Ajustes", style: "default", onPress: () => Linking.openSettings().catch(() => {}) }
          ]
        );
      }
    } catch (err: any) {
      Alert.alert(
        "No se pudo pedir el permiso",
        "Error: " + (err?.message ?? String(err)),
        [
          { text: "OK", style: "default" },
          { text: "Abrir Ajustes", style: "default", onPress: () => Linking.openSettings().catch(() => {}) }
        ]
      );
    }
  };

  // --- Seleccionar ejercicio e ir directo a tracking ---
  const selectExercise = useCallback((ex: ExercisePreset) => {
    Keyboard.dismiss();
    setPreset(ex);
    setCount(0);
    lastHipYRef.current = null;
    repPhaseRef.current = "up";
    repPeakYRef.current = 1.0;
    setMode("tracking");
  }, []);

  // --- Filtrar ejercicios por búsqueda ---
  const filteredExercises = useMemo(() => {
    const all = Object.values(EXERCISE_PRESETS);
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase().trim();
    return all.filter((ex) =>
      ex.name.toLowerCase().includes(q) ||
      (ex.primaryMuscle ?? "").toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // --- Render: sin permiso ---
  if (!cameraPerm.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de cámara requerido</Text>
        <Text style={styles.hint}>
          La cámara se usa solo dentro de esta app para detectar tu postura en
          tiempo real. El video nunca sale del dispositivo.
        </Text>
        <Pressable style={styles.btn} onPress={handleRequestCameraPermission} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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

  // --- Render: sin dispositivo ---
  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.md }}>Buscando cámara…</Text>
      </View>
    );
  }

  // --- Render: selector de ejercicio ---
  if (mode === "select_exercise") {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.selectorContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.selectorTitle}>Coach AI</Text>
        <Text style={styles.selectorSubtitle}>
          Toca un ejercicio para iniciar la cámara al instante.
        </Text>

        {/* Steppers grandes */}
        <View style={styles.stepperRow}>
          <View style={styles.stepperBox}>
            <Text style={styles.stepperLabel}>Peso (kg)</Text>
            <View style={styles.stepperControls}>
              <Pressable style={styles.stepperBtn} onPress={() => setWeight((w) => Math.max(0, w - 2.5))}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{weight}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => setWeight((w) => w + 2.5)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.stepperBox}>
            <Text style={styles.stepperLabel}>Reps objetivo</Text>
            <View style={styles.stepperControls}>
              <Pressable style={styles.stepperBtn} onPress={() => setTargetReps((r) => Math.max(1, r - 1))}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{targetReps}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => setTargetReps((r) => r + 1)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Buscador */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ejercicio o músculo…"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={false}
            returnKeyType="search"
            blurOnSubmit={true}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Categorías con ejercicios (collapsables) */}
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const exercises = filteredExercises.filter((p) => p.category === cat);
          if (exercises.length === 0) return null;
          const isCollapsed = collapsedCats[cat] === true;

          return (
            <View key={cat} style={styles.categoryBlock}>
              <Pressable
                style={styles.categoryHeader}
                onPress={() => setCollapsedCats((c) => ({ ...c, [cat]: !isCollapsed }))}
              >
                <Text style={styles.categoryEmoji}>{meta.emoji}</Text>
                <Text style={styles.categoryLabel}>{meta.label}</Text>
                <Text style={styles.categoryCount}>{exercises.length}</Text>
                <Text style={styles.categoryChevron}>{isCollapsed ? "▸" : "▾"}</Text>
              </Pressable>

              {!isCollapsed && (
                <View style={styles.exGrid}>
                  {exercises.map((ex) => {
                    const selected = preset.id === ex.id;
                    return (
                      <Pressable
                        key={ex.id}
                        style={[styles.exCard, selected && { borderColor: meta.color, borderWidth: 2 }]}
                        onPress={() => selectExercise(ex)}
                      >
                        <View style={[styles.exStripe, { backgroundColor: meta.color }]} />
                        <Text style={styles.exEmoji}>{ex.emoji ?? "🏋️"}</Text>
                        <Text style={styles.exName}>{ex.name}</Text>
                        <Text style={styles.exMuscle}>{ex.primaryMuscle ?? ""}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.footerHint}>
          {filteredExercises.length} ejercicios · Toca cualquiera para iniciar
        </Text>
      </ScrollView>
    );
  }

  // --- Render: tracking (preview de cámara + overlay + HUD) ---
  return (
    <View style={styles.trackingContainer}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={mode === "tracking"}
        photo={false}
        video={false}
        audio={false}
        frameProcessor={frameProcessor}
      />

      {/* Overlay del esqueleto */}
      <SkeletonOverlaySimple
        pose={pose}
        width={width}
        height={height}
        pointColor="#fbbf24"
        pointRadius={5}
        lineColor="#ef4444"
        lineWidth={2}
      />

      {/* HUD top */}
      <View style={styles.hudTop}>
        <Pressable style={styles.hudBtn} onPress={() => setMode("select_exercise")}>
          <Text style={styles.hudBtnText}>← Atrás</Text>
        </Pressable>
        <Text style={styles.hudTitle}>{preset.emoji} {preset.name}</Text>
        <View style={styles.hudFps}>
          <Text style={styles.hudFpsText}>{fps} fps</Text>
        </View>
      </View>

      {/* Estado de pose detection */}
      <View style={styles.poseStatus}>
        {pose && pose.detected ? (
          <Text style={styles.poseStatusOk}>✓ Pose detectada ({pose.landmarks.length} puntos)</Text>
        ) : (
          <Text style={styles.poseStatusWarn}>Esperando cuerpo…</Text>
        )}
      </View>

      {/* HUD bottom */}
      <View style={styles.hudBottom}>
        <View style={styles.hudStat}>
          <Text style={styles.hudStatLabel}>Reps</Text>
          <Text style={styles.hudStatValue}>{count}</Text>
          <View style={styles.hudStatRow}>
            <Pressable style={styles.hudStepperBtn} onPress={() => setCount((c) => Math.max(0, c - 1))}>
              <Text style={styles.hudStepperText}>−</Text>
            </Pressable>
            <Pressable style={styles.hudStepperBtn} onPress={() => setCount((c) => c + 1)}>
              <Text style={styles.hudStepperText}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.hudStat}>
          <Text style={styles.hudStatLabel}>Peso</Text>
          <Text style={styles.hudStatValue}>{weight}</Text>
          <Text style={styles.hudStatUnit}>kg</Text>
        </View>
        <View style={styles.hudStat}>
          <Text style={styles.hudStatLabel}>Objetivo</Text>
          <Text style={styles.hudStatValue}>{targetReps}</Text>
          <Text style={styles.hudStatUnit}>reps</Text>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.lg },
  title: { color: colors.bright, fontSize: 22, fontWeight: "700", marginBottom: spacing.lg },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: spacing.lg, paddingHorizontal: spacing.lg, lineHeight: 19 },
  btn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },

  // Selector
  selectorContainer: { padding: spacing.lg, paddingTop: spacing.xl + 12, paddingBottom: spacing.xxl },
  selectorTitle: { color: colors.bright, fontSize: 28, fontWeight: "800", marginBottom: spacing.xs },
  selectorSubtitle: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.lg, lineHeight: 19 },

  stepperRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stepperBox: { flex: 1, backgroundColor: colors.bgCard, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim },
  stepperLabel: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, textAlign: "center" },
  stepperControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  stepperBtn: { backgroundColor: colors.accent, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stepperBtnText: { color: colors.bg, fontSize: 22, fontWeight: "900" },
  stepperValue: { color: colors.bright, fontSize: 22, fontWeight: "800", minWidth: 50, textAlign: "center" },

  // Buscador
  searchBox: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.dim, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.lg, gap: spacing.sm
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: colors.bright, fontSize: 15, paddingVertical: 0, minHeight: 22 },
  searchClear: { color: colors.textMuted, fontSize: 16, fontWeight: "700", paddingHorizontal: 6 },

  // Categorías
  categoryBlock: { marginBottom: spacing.lg },
  categoryHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.sm
  },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { color: colors.bright, fontSize: 16, fontWeight: "700", flex: 1 },
  categoryCount: { color: colors.textMuted, fontSize: 12, fontWeight: "700", backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  categoryChevron: { color: colors.textMuted, fontSize: 14, marginLeft: 4 },

  exGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  exCard: { width: "47%", backgroundColor: colors.bgCard, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, position: "relative", overflow: "hidden" },
  exStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  exEmoji: { fontSize: 28, marginBottom: spacing.xs },
  exName: { color: colors.bright, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  exMuscle: { color: colors.textMuted, fontSize: 11 },

  footerHint: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.xxl },

  // Tracking
  trackingContainer: { flex: 1, backgroundColor: "#000" },
  hudTop: { position: "absolute", top: 40, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hudBtn: { backgroundColor: "rgba(8,10,14,0.85)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dim },
  hudBtnText: { color: colors.bright, fontWeight: "700", fontSize: 13 },
  hudTitle: { color: colors.bright, fontSize: 16, fontWeight: "800", backgroundColor: "rgba(8,10,14,0.85)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  hudFps: { backgroundColor: "rgba(8,10,14,0.85)", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dim, minWidth: 70, alignItems: "center" },
  hudFpsText: { color: colors.bright, fontSize: 12, fontWeight: "700" },

  poseStatus: { position: "absolute", top: 90, left: 12, right: 12, alignItems: "center" },
  poseStatusOk: { backgroundColor: "rgba(34,197,94,0.9)", color: "#fff", fontSize: 12, fontWeight: "700", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  poseStatusWarn: { backgroundColor: "rgba(245,158,11,0.9)", color: "#000", fontSize: 12, fontWeight: "700", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },

  hudBottom: { position: "absolute", bottom: 40, left: 12, right: 12, flexDirection: "row", gap: spacing.sm, justifyContent: "space-around" },
  hudStat: { backgroundColor: "rgba(8,10,14,0.85)", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, alignItems: "center", minWidth: 90 },
  hudStatLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  hudStatValue: { color: colors.bright, fontSize: 24, fontWeight: "900" },
  hudStatUnit: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  hudStatRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  hudStepperBtn: { backgroundColor: colors.accent, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hudStepperText: { color: colors.bg, fontSize: 18, fontWeight: "900" }
});
