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
  ActivityIndicator, Linking, Alert, TextInput, Keyboard, AppState, Switch, Vibration
} from "react-native";
import { Camera, useCameraPermission, useCameraDevice } from "react-native-vision-camera";
import { useIsFocused, useRoute } from "@react-navigation/native";
import { useKeepAwake } from "expo-keep-awake";

import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { colors, spacing, radius } from "@/theme/colors";
import { usePoseDetection } from "./hooks/usePoseDetection";
import { LiveFormEngine, EMPTY_SNAPSHOT, type LiveSnapshot } from "@/modules/biomechanics/liveFormEngine";
import { FormGuideBox } from "./FormGuideBox";
import {
  GOAL_META, isCompound, recommendRestSeconds, formatRest, type TrainingGoal
} from "./restRecommendation";

// ============================================================================
// SkeletonPoints — DEBE definirse ANTES de CameraScreen (const no se hoistinga)
// ============================================================================
const SKELETON_CONNECTIONS: [string, string][] = [
  ["leftShoulderPosition", "rightShoulderPosition"],
  ["leftShoulderPosition", "leftElbowPosition"], ["leftElbowPosition", "leftWristPosition"],
  ["rightShoulderPosition", "rightElbowPosition"], ["rightElbowPosition", "rightWristPosition"],
  ["leftShoulderPosition", "leftHipPosition"], ["rightShoulderPosition", "rightHipPosition"],
  ["leftHipPosition", "rightHipPosition"],
  ["leftHipPosition", "leftKneePosition"], ["leftKneePosition", "leftAnklePosition"],
  ["rightHipPosition", "rightKneePosition"], ["rightKneePosition", "rightAnklePosition"],
  ["nosePosition", "leftEyePosition"], ["nosePosition", "rightEyePosition"],
  ["leftEyePosition", "leftEarPosition"], ["rightEyePosition", "rightEarPosition"]
];

const SkeletonPoints: React.FC<{ pose: any; width: number; height: number; mirror: boolean }> = ({ pose, width, height, mirror }) => {
  if (!pose || !pose._hasData || width <= 0 || height <= 0) return null;

  // Tamaño REAL del frame (vertical), enviado por el worklet.
  const srcW: number = pose._frameW || 480;
  const srcH: number = pose._frameH || 640;

  // <Camera> usa resizeMode="cover": el frame se escala hasta CUBRIR la vista
  // y se recorta lo que sobra, centrado. Replicamos exactamente esa transformación.
  const scale = Math.max(width / srcW, height / srcH);
  const offX = (srcW * scale - width) / 2;
  const offY = (srcH * scale - height) / 2;

  const getLM = (name: string): { x: number; y: number } | null => {
    const x = pose[name + "_x"];
    const y = pose[name + "_y"];
    if (typeof x !== "number" || typeof y !== "number") return null;
    let px = x * scale - offX;
    const py = y * scale - offY;
    if (mirror) px = width - px; // cámara frontal = espejo
    return { x: px, y: py };
  };

  const lmNames = [
    "leftShoulderPosition", "rightShoulderPosition",
    "leftElbowPosition", "rightElbowPosition",
    "leftWristPosition", "rightWristPosition",
    "leftHipPosition", "rightHipPosition",
    "leftKneePosition", "rightKneePosition",
    "leftAnklePosition", "rightAnklePosition",
    "nosePosition", "leftEyePosition", "rightEyePosition",
    "leftEarPosition", "rightEarPosition"
  ];

  const points: React.ReactNode[] = lmNames.map((name) => {
    const lm = getLM(name);
    if (!lm) return null;
    return (
      <View key={`pt-${name}`} style={{
        position: "absolute", left: lm.x - 6, top: lm.y - 6,
        width: 12, height: 12, borderRadius: 6, backgroundColor: "#fbbf24",
        borderWidth: 2, borderColor: "#fff"
      }} />
    );
  }).filter(Boolean);

  const lines: React.ReactNode[] = SKELETON_CONNECTIONS.map(([a, b], i) => {
    const la = getLM(a);
    const lb = getLM(b);
    if (!la || !lb) return null;
    const dx = lb.x - la.x, dy = lb.y - la.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 2) return null;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    // React Native rota alrededor del CENTRO de la vista: se coloca la línea
    // centrada en el punto medio del segmento (antes quedaba desplazada).
    const midX = (la.x + lb.x) / 2, midY = (la.y + lb.y) / 2;
    return (
      <View key={`ln-${i}`} style={{
        position: "absolute", left: midX - length / 2, top: midY - 2, width: length, height: 4,
        backgroundColor: "#ef4444", borderRadius: 2,
        transform: [{ rotate: `${angle}deg` }]
      }} />
    );
  }).filter(Boolean);

  return (
    <View style={{ position: "absolute", top: 0, left: 0, width, height }} pointerEvents="none">
      {lines}
      {points}
    </View>
  );
};

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
  // Peso extra: solo se muestra/usa si el usuario lo activa (peso corporal = apagado).
  const [useExtraWeight, setUseExtraWeight] = useState(false);
  const [weight, setWeight] = useState(20);
  const [count, setCount] = useState(0);
  // Objetivo editable: reps + meta de entrenamiento (define el descanso sugerido).
  const [goal, setGoal] = useState<TrainingGoal>("hypertrophy");
  const [goalOpen, setGoalOpen] = useState(false);
  // --- Descanso entre series ---
  // Mientras se descansa se APAGA la cámara y la detección de pose (no hay
  // movimiento que contar, ahorra batería y evita falsos conteos).
  const [resting, setResting] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const engineRef = useRef<LiveFormEngine | null>(null);
  const [live, setLive] = useState<LiveSnapshot>(EMPTY_SNAPSHOT);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const cameraRef = useRef<any>(null);

  // reloadKey: cuando cambia, se re-monta TODO el componente (incluida la cámara).
  // Útil para forzar re-inicialización cuando la cámara se queda colgada.
  const [reloadKey, setReloadKey] = useState(0);

  // Tamaño REAL del contenedor de la cámara (no el de la ventana: hay header y tab bar).
  const [box, setBox] = useState({ w: width, h: height });
  // La cámara solo debe estar activa si la pestaña está visible y la app en primer plano.
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const lastCamErrRef = useRef(0);

  // Al volver a esta pestaña, re-montar la cámara (evita que se quede colgada).
  useEffect(() => {
    if (isFocused) setReloadKey((k) => k + 1);
  }, [isFocused]);

  // Si VisionCamera reporta un error, re-montar (máx. 1 vez cada 3 s).
  const handleCameraError = (e: any) => {
    console.warn("[Camera] onError:", e?.code, e?.message);
    const now = Date.now();
    if (now - lastCamErrRef.current > 3000) {
      lastCamErrRef.current = now;
      setReloadKey((k) => k + 1);
    }
  };

  // AppState listener: al volver a la app DESDE BACKGROUND (no desde inactive),
  // re-montar la cámara. Solo disparamos en transición background→active,
  // NO en inactive→active (eso pasa al abrir modals/alerts y causaría recargas
  // constantes que cierran la cámara).
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;
      setAppActive(nextAppState === "active");
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
  const { pose, fps, frameProcessor, isAvailable: poseAvailable } = usePoseDetection(mode === "tracking" && isFocused && appActive && !resting);

  // --- Motor en vivo: cuenta reps del EJERCICIO SELECCIONADO + evalúa la técnica ---
  // (reemplaza la heurística anterior de altura de cadera, que era igual para todos
  // los ejercicios y no servía para curl, press, remo, etc.)
  useEffect(() => {
    if (mode !== "tracking" || !engineRef.current || resting) return;
    const snap = engineRef.current.update(pose && pose._hasData ? (pose as any) : null, Date.now());
    setCount(snap.count);
    setLive(snap);
  }, [pose, mode, resting]);

  const adjustCount = (delta: number) => {
    const next = Math.max(0, count + delta);
    engineRef.current?.setCount(next);
    setCount(next);
  };

  const newSet = () => {
    engineRef.current?.reset();
    setCount(0);
    setLive(EMPTY_SNAPSHOT);
  };

  const goalReached = live.supportsReps && targetReps > 0 && count >= targetReps;
  const restSeconds = recommendRestSeconds(goal, isCompound(preset), live.partialCount >= 2);

  const startRest = () => {
    setRestLeft(restSeconds);
    setResting(true);
  };

  const endRest = () => {
    setResting(false);
    setSetNumber((n) => n + 1);
    newSet();           // reset() desarma el motor: hay que volver a la posición inicial
    Vibration.vibrate([0, 250, 120, 250]);
  };

  // Al cumplir el objetivo de reps se entra solo en descanso.
  useEffect(() => {
    if (goalReached && !resting && mode === "tracking") startRest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalReached]);

  // Cuenta atrás del descanso.
  useEffect(() => {
    if (!resting) return;
    if (restLeft <= 0) { endRest(); return; }
    const t = setTimeout(() => setRestLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resting, restLeft]);

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
    engineRef.current = new LiveFormEngine(ex);
    setCount(0);
    setLive(EMPTY_SNAPSHOT);
    setGoalOpen(false);
    setResting(false);
    setSetNumber(1);
    setMode("tracking");
  };

  // --- Lanzado desde la biblioteca: navigate("Main", { screen: "Coach", params: { exerciseId, nonce } }) ---
  const route = useRoute<any>();
  const launchExerciseId: string | undefined = route.params?.exerciseId;
  const launchNonce: number | undefined = route.params?.nonce;
  useEffect(() => {
    if (launchExerciseId && EXERCISE_PRESETS[launchExerciseId]) {
      selectExercise(EXERCISE_PRESETS[launchExerciseId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchExerciseId, launchNonce]);

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
        <Pressable
          style={[styles.btn, { marginTop: spacing.md }]}
          onPress={() => {
            // Fuerza a useCameraDevice a volver a consultar los dispositivos.
            setCameraPosition((p) => (p === "back" ? "front" : "back"));
            setTimeout(() => setCameraPosition("back"), 400);
            setReloadKey((k) => k + 1);
          }}
        >
          <Text style={styles.btnText}>Reintentar</Text>
        </Pressable>
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
            <View style={styles.extraRow}>
              <Text style={styles.stepperLabel}>Peso extra</Text>
              <Switch value={useExtraWeight} onValueChange={setUseExtraWeight} />
            </View>
            {useExtraWeight ? (
              <View style={styles.stepperControls}>
                <Pressable style={styles.stepperBtn} onPress={() => setWeight((w) => Math.max(0, w - 2.5))}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{weight}</Text>
                <Pressable style={styles.stepperBtn} onPress={() => setWeight((w) => w + 2.5)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.extraOff}>Peso corporal</Text>
            )}
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
    <View
      key={reloadKey}
      style={styles.trackingContainer}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={mode === "tracking" && isFocused && appActive && !resting}
        resizeMode="cover"
        onError={handleCameraError}
        photo={false}
        video={false}
        audio={false}
        frameProcessor={resting ? undefined : frameProcessor}
      />

      {/* Overlay de puntos del esqueleto */}
      {!resting && pose && pose._hasData ? (
        <SkeletonPoints pose={pose} width={box.w} height={box.h} mirror={cameraPosition === "front"} />
      ) : null}

      {/* Estado de pose: SOLO aparece si hay un problema (cuerpo perdido / FPS bajos).
          Con el cuerpo detectado y fluido no se muestra, y al cumplir el objetivo desaparece. */}
      {!resting && live.bodyVisible && live.supportsReps && !live.armed && (
        <View style={styles.poseStatus} pointerEvents="none">
          <Text style={styles.poseStatusInfo}>
            Colócate en la posición inicial y quédate quieto para empezar
          </Text>
        </View>
      )}
      {!resting && !goalReached && (!live.bodyVisible || (fps > 0 && fps < 12)) && (
        <View style={styles.poseStatus} pointerEvents="none">
          {poseAvailable ? (
            <Text style={styles.poseStatusWarn}>
              {live.bodyVisible ? `FPS bajos · ${fps}` : "Esperando cuerpo… colócate de cuerpo completo"}
            </Text>
          ) : (
            <Text style={styles.poseStatusInfo}>ML Kit no disponible</Text>
          )}
        </View>
      )}

      {/* Cuadro de técnica (transparente): verde = bien · rojo = corrige · neutro = guía.
          Al cumplir el objetivo se sustituye por el descanso recomendado. */}
      {resting ? null : (
        <FormGuideBox
          state={live.formState}
          message={live.message}
          exerciseName={preset.name}
          hint={preset.calibrationHint}
        />
      )}

      {/* Pantalla de descanso: cámara y detección apagadas */}
      {resting && (
        <View style={styles.restOverlay}>
          <Text style={styles.restOverlayTitle}>😮‍💨 Descanso</Text>
          <Text style={styles.restOverlayTime}>{formatRest(Math.max(0, restLeft))}</Text>
          <Text style={styles.restOverlayHint}>
            Serie {setNumber} completada · {count} rep{count === 1 ? "" : "s"}
            {live.partialCount > 0 ? ` (${live.partialCount} parcial${live.partialCount === 1 ? "" : "es"})` : ""}
            {"\n"}Cámara en pausa: no se detecta movimiento mientras descansas.
          </Text>
          <View style={styles.restRow}>
            <Pressable style={styles.restBtn} onPress={() => setRestLeft((n) => Math.max(5, n - 15))}>
              <Text style={styles.restBtnText}>−15 s</Text>
            </Pressable>
            <Pressable style={styles.restBtn} onPress={() => setRestLeft((n) => n + 15)}>
              <Text style={styles.restBtnText}>+15 s</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.restBtn, styles.restBtnPrimary]} onPress={endRest}>
            <Text style={[styles.restBtnText, { color: colors.bg }]}>Saltar descanso · Serie {setNumber + 1}</Text>
          </Pressable>
        </View>
      )}

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

      {/* Editor del objetivo: reps + meta (define el descanso) */}
      {goalOpen && (
        <View style={styles.goalPanel}>
          <Text style={styles.goalTitle}>¿Cuál es tu meta?</Text>
          <View style={styles.goalChips}>
            {(Object.keys(GOAL_META) as TrainingGoal[]).map((g) => (
              <Pressable
                key={g}
                style={[styles.goalChip, goal === g && styles.goalChipOn]}
                onPress={() => setGoal(g)}
              >
                <Text style={[styles.goalChipText, goal === g && { color: colors.bg }]}>
                  {GOAL_META[g].emoji} {GOAL_META[g].label}
                </Text>
                <Text style={[styles.goalChipHint, goal === g && { color: colors.bg }]}>{GOAL_META[g].hint}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stepperControls}>
            <Text style={styles.goalLabel}>Reps objetivo</Text>
            <Pressable style={styles.stepperBtn} onPress={() => setTargetReps((r) => Math.max(1, r - 1))}>
              <Text style={styles.stepperBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue}>{targetReps}</Text>
            <Pressable style={styles.stepperBtn} onPress={() => setTargetReps((r) => r + 1)}>
              <Text style={styles.stepperBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.hudBottom}>
        <View style={styles.hudStat}>
          <Text style={styles.hudStatLabel}>Reps</Text>
          <Text style={styles.hudStatValue}>{count}</Text>
          {!live.supportsReps && <Text style={styles.hudStatUnit}>isométrico</Text>}
          <View style={styles.hudStatRow}>
            <Pressable style={styles.hudStepperBtn} onPress={() => adjustCount(-1)}>
              <Text style={styles.hudStepperText}>−</Text>
            </Pressable>
            <Pressable style={styles.hudStepperBtn} onPress={() => adjustCount(1)}>
              <Text style={styles.hudStepperText}>+</Text>
            </Pressable>
          </View>
        </View>
        {useExtraWeight && (
          <View style={styles.hudStat}>
            <Text style={styles.hudStatLabel}>Peso extra</Text>
            <Text style={styles.hudStatValue}>{weight}</Text>
            <Text style={styles.hudStatUnit}>kg</Text>
          </View>
        )}
        <Pressable style={[styles.hudStat, goalReached && { borderColor: "#22c55e" }]} onPress={() => setGoalOpen((o) => !o)}>
          <Text style={styles.hudStatLabel}>Objetivo ✎</Text>
          <Text style={styles.hudStatValue}>{targetReps}</Text>
          <Text style={styles.hudStatUnit}>{GOAL_META[goal].label}</Text>
        </Pressable>
        {!resting && (
          <Pressable style={[styles.hudStat, { backgroundColor: colors.accent }]} onPress={count > 0 ? startRest : newSet}>
            <Text style={[styles.hudStatLabel, { color: colors.bg }]}>{count > 0 ? "Terminar" : "Reiniciar"}</Text>
            <Text style={[styles.hudStatValue, { color: colors.bg, fontSize: 18 }]}>{count > 0 ? "→ descanso" : "serie"}</Text>
          </Pressable>
        )}
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
  hudStepperText: { color: colors.bg, fontSize: 18, fontWeight: "900" },

  // Peso extra
  extraRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  extraOff: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 10 },

  // Descanso recomendado (transparente)
  restBox: {
    position: "absolute", top: 100, left: 12, right: 12, padding: 12, borderRadius: 12,
    borderWidth: 2, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.18)"
  },
  restOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(8,10,14,0.97)", alignItems: "center", justifyContent: "center", padding: spacing.lg
  },
  restOverlayTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: spacing.sm },
  restOverlayTime: { color: colors.accent, fontSize: 64, fontWeight: "900", marginBottom: spacing.sm },
  restOverlayHint: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: spacing.lg },
  restRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  restBtn: { backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim },
  restBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  restBtnText: { color: colors.bright, fontWeight: "800", fontSize: 14 },
  restTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  restText: { color: "#fff", fontSize: 13, marginTop: 4 },

  // Editor de objetivo
  goalPanel: {
    position: "absolute", bottom: 150, left: 12, right: 12, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: "rgba(8,10,14,0.92)", borderWidth: 1, borderColor: colors.accent, gap: spacing.sm
  },
  goalTitle: { color: colors.bright, fontSize: 14, fontWeight: "800" },
  goalChips: { flexDirection: "row", gap: spacing.sm },
  goalChip: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dim, alignItems: "center" },
  goalChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  goalChipText: { color: colors.bright, fontSize: 12, fontWeight: "800" },
  goalChipHint: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  goalLabel: { color: colors.textMuted, fontSize: 12, marginRight: spacing.sm }
});
