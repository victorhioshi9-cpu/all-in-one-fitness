/**
 * CameraScreen.tsx — Versión funcional simple (v0.3.5)
 * ----------------------------------------------------------------------------
 * Versión sin react-native-reanimated, sin Skia overlay, sin pose detection.
 * Solo preview de cámara + selector de ejercicio + steppers grandes.
 *
 * Cambios v0.3.5:
 *   - Selección directa: al tocar un ejercicio, se inicia la cámara al instante
 *     (sin botón "Iniciar cámara").
 *   - Buscador de ejercicios (filtro por texto).
 *   - Categorías collapsables (tap header para mostrar/ocultar ejercicios).
 *   - Catálogo ampliado a 41 ejercicios.
 */
import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions,
  ActivityIndicator, Linking, Alert, TextInput, Keyboard, AppState
} from "react-native";
import { Camera, useCameraPermission, useCameraDevice } from "react-native-vision-camera";
import { useKeepAwake } from "expo-keep-awake";

import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { colors, spacing, radius } from "@/theme/colors";
import { usePoseDetection } from "./hooks/usePoseDetection";

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
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("back");
  const device = useCameraDevice(cameraPosition);

  const [mode, setMode] = useState<Mode>("select_exercise");
  const [preset, setPreset] = useState<ExercisePreset>(EXERCISE_PRESETS.squat);
  const [targetReps, setTargetReps] = useState(8);
  const [weight, setWeight] = useState(40);
  const [count, setCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const cameraRef = useRef<any>(null);

  // reloadKey: cuando cambia, se re-monta TODO el componente (incluida la cámara).
  // Útil para forzar re-inicialización cuando la cámara se queda colgada.
  const [reloadKey, setReloadKey] = useState(0);

  // AppState listener: al volver a la app DESDE BACKGROUND (no desde inactive),
  // re-montar la cámara. Solo disparamos en transición background→active,
  // NO en inactive→active (eso pasa al abrir modals/alerts y causaría recargas
  // constantes que cierran la cámara).
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;
      // SOLO recargar si venimos de "background" (la app estuvo en segundo plano).
      // "inactive" es transitorio (modal, alert) y NO debe recargar la cámara.
      if (prev === "background" && nextAppState === "active") {
        console.log("[CameraScreen] app volvió de background, re-montando cámara...");
        setReloadKey((k) => k + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  // --- Toggle de pose detection ---
  // Por defecto DESACTIVADO. El frame processor con runOnJS puede causar
  // crashes nativos en algunos dispositivos. El usuario lo activa manualmente
  // con el botón "Esqueleto ON/OFF" en el HUD.
  // Si se activa y la app crashea, sabremos que el problema es el plugin nativo.
  // --- Pose detection con Google ML Kit ---
  // Hook se llama SIEMPRE (reglas de hooks). El parámetro 'active' controla.
  const { pose, fps, frameProcessor, isAvailable: poseAvailable } = usePoseDetection(mode === "tracking");

  // --- Contador automático de reps (heurística por altura de cadera) ---
  const lastHipYRef = useRef<number | null>(null);
  const repPhaseRef = useRef<"down" | "up">("up");
  const repPeakYRef = useRef<number>(1.0);

  useEffect(() => {
    if (mode !== "tracking" || !pose || !pose._hasData) return;
    const lhY = pose.leftHipPosition_y;
    const rhY = pose.rightHipPosition_y;
    if (typeof lhY !== "number" || typeof rhY !== "number") return;
    const hipY = ((lhY + rhY) / 2) / 1920;
    if (typeof hipY !== "number" || isNaN(hipY)) return;

    const last = lastHipYRef.current;
    lastHipYRef.current = hipY;

    if (last === null) {
      repPeakYRef.current = hipY;
      return;
    }

    if (hipY > last + 0.005) {
      if (hipY > repPeakYRef.current) repPeakYRef.current = hipY;
      repPhaseRef.current = "down";
    } else if (hipY < last - 0.005) {
      if (repPhaseRef.current === "down") {
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
  const selectExercise = (ex: ExercisePreset) => {
    setPreset(ex);
    setCount(0);
    setMode("tracking");
  };

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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.selectorContainer}>
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

  // --- Render: tracking (preview de cámara + pose detection ML Kit) ---
  return (
    <View key={reloadKey} style={styles.trackingContainer}>
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

      {/* Overlay de puntos del esqueleto */}
      {pose && pose._hasData ? (
        <SkeletonPoints pose={pose} width={width} height={height} />
      ) : null}

      {/* Estado de pose detection */}
      <View style={styles.poseStatus}>
        {pose && pose._hasData ? (
          <Text style={styles.poseStatusOk}>✓ Cuerpo detectado · {fps} fps · {pose._landmarkCount} puntos</Text>
        ) : poseAvailable ? (
          <Text style={styles.poseStatusWarn}>Esperando cuerpo… · {fps} fps</Text>
        ) : (
          <Text style={styles.poseStatusInfo}>ML Kit no disponible</Text>
        )}
      </View>

      {/* Guía de cómo hacer el ejercicio */}
      <View style={styles.guideBox}>
        <Text style={styles.guideTitle}>📋 Cómo hacer {preset.name}</Text>
        <Text style={styles.guideText}>{preset.calibrationHint}</Text>
        <Text style={styles.guideMeta}>Músculo: {preset.primaryMuscle} · Categoría: {preset.category}</Text>
      </View>

      {/* HUD mínimo */}
      <View style={styles.hudTop}>
        <Pressable style={styles.hudBtn} onPress={() => setMode("select_exercise")}>
          <Text style={styles.hudBtnText}>← Atrás</Text>
        </Pressable>
        <Text style={styles.hudTitle}>{preset.emoji} {preset.name}</Text>
        <View style={styles.hudTopRight}>
          <Pressable
            style={styles.hudBtn}
            onPress={() => setCameraPosition((p) => p === "back" ? "front" : "back")}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          >
            <Text style={styles.hudBtnText}>🔄</Text>
          </Pressable>
        </View>
      </View>

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
  searchInput: { flex: 1, color: colors.bright, fontSize: 15, paddingVertical: 0 },
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
  hudTopRight: { flexDirection: "row", gap: 6, alignItems: "center" },
  hudBtn: { backgroundColor: "rgba(8,10,14,0.85)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dim },
  hudBtnText: { color: colors.bright, fontWeight: "700", fontSize: 13 },
  hudTitle: { color: colors.bright, fontSize: 16, fontWeight: "800", backgroundColor: "rgba(8,10,14,0.85)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },

  poseStatus: { position: "absolute", top: 90, left: 12, right: 12, alignItems: "center" },
  poseStatusOk: { backgroundColor: "rgba(34,197,94,0.9)", color: "#fff", fontSize: 12, fontWeight: "700", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  poseStatusWarn: { backgroundColor: "rgba(245,158,11,0.9)", color: "#000", fontSize: 12, fontWeight: "700", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  poseStatusInfo: { backgroundColor: "rgba(8,10,14,0.85)", color: colors.textMuted, fontSize: 11, fontWeight: "600", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dim },

  guideBox: {
    position: "absolute", top: 130, left: 12, right: 12,
    backgroundColor: "rgba(8,10,14,0.92)", padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent
  },
  guideTitle: { color: colors.bright, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  guideText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  guideMeta: { color: colors.dim, fontSize: 11, fontStyle: "italic" },

  hudBottom: { position: "absolute", bottom: 40, left: 12, right: 12, flexDirection: "row", gap: spacing.sm, justifyContent: "space-around" },
  hudStat: { backgroundColor: "rgba(8,10,14,0.85)", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, alignItems: "center", minWidth: 90 },
  hudStatLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  hudStatValue: { color: colors.bright, fontSize: 24, fontWeight: "900" },
  hudStatUnit: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  hudStatRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  hudStepperBtn: { backgroundColor: colors.accent, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hudStepperText: { color: colors.bg, fontSize: 18, fontWeight: "900" }
});
