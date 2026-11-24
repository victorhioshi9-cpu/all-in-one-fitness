/**
 * OnboardingScreen.tsx (Rediseño v0.4) - NEW
 * ----------------------------------------------------------------------------
 * Wizard de 4 pasos para capturar el perfil del usuario:
 *   Paso 1: Género (3 opciones grandes con emoji)
 *   Paso 2: Edad, altura (cm) y peso (kg) con steppers grandes
 *   Paso 3: Nivel de actividad (5 chips con descripción)
 *   Paso 4: Objetivo (3 cards) + resumen final con BMR y objetivos calculados
 *
 * Al finalizar, llama a setOnboardingData(...) + setOnboardingCompleted(true).
 * La app (App.tsx) entonces cambia al RootNavigator principal.
 *
 * Estilo: números grandes, color accent para selección, transiciones suaves,
 * barra de progreso arriba, fondo oscuro consistente con el resto de la app.
 */
import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions,
  KeyboardAvoidingView, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/theme/colors";
import {
  useSettingsStore,
  computeTargets,
  type Gender, type Goal, type ActivityLevel
} from "@/store/settingsStore";

const TOTAL_STEPS = 4;

export const OnboardingScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const setOnboardingData = useSettingsStore((s) => s.setOnboardingData);
  const setOnboardingCompleted = useSettingsStore((s) => s.setOnboardingCompleted);

  const [step, setStep] = useState(0);

  // Estado local por wizard (se persiste al finalizar).
  const [gender, setGender] = useState<Gender | null>(null);
  const [ageYears, setAgeYears] = useState<number>(28);
  const [heightCm, setHeightCm] = useState<number>(170);
  const [weightKg, setWeightKg] = useState<number>(70);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);

  const targets = useMemo(
    () => computeTargets({ heightCm, weightKg, ageYears, gender, goal, activityLevel }),
    [heightCm, weightKg, ageYears, gender, goal, activityLevel]
  );

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return gender !== null;
      case 1: return ageYears > 0 && heightCm > 0 && weightKg > 0;
      case 2: return activityLevel !== null;
      case 3: return goal !== null;
      default: return false;
    }
  }, [step, gender, ageYears, heightCm, weightKg, activityLevel, goal]);

  const handleFinalize = () => {
    if (!gender || !activityLevel || !goal) return;
    setOnboardingData({
      heightCm, weightKg, ageYears, gender, goal, activityLevel
    });
    setOnboardingCompleted(true);
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else handleFinalize();
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.brandRow}>
            <Text style={styles.brandEmoji}>🏋️</Text>
            <View>
              <Text style={styles.brandTitle}>All-in-One Fitness</Text>
              <Text style={styles.brandSub}>Configura tu perfil en 4 pasos</Text>
            </View>
          </View>

          {/* Progress */}
          <View style={styles.progressTrack}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSegment,
                  i <= step && styles.progressSegmentActive,
                  i === step && styles.progressSegmentCurrent
                ]}
              />
            ))}
          </View>
          <Text style={styles.progressLabel}>
            Paso {step + 1} de {TOTAL_STEPS}
          </Text>

          {/* Steps */}
          {step === 0 && (
            <GenderStep gender={gender} onSelect={setGender} />
          )}

          {step === 1 && (
            <MeasurementsStep
              ageYears={ageYears}
              heightCm={heightCm}
              weightKg={weightKg}
              onAge={setAgeYears}
              onHeight={setHeightCm}
              onWeight={setWeightKg}
            />
          )}

          {step === 2 && (
            <ActivityStep activity={activityLevel} onSelect={setActivityLevel} />
          )}

          {step === 3 && (
            <GoalStep
              goal={goal}
              onSelect={setGoal}
              targets={targets}
              weightKg={weightKg}
            />
          )}

          {/* Nav */}
          <View style={[styles.navRow, { marginTop: spacing.xl }]}>
            {step > 0 ? (
              <Pressable style={styles.navBack} onPress={goBack} hitSlop={8}>
                <Text style={styles.navBackText}>← Atrás</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}

            <Pressable
              style={[styles.navNext, !canAdvance && styles.navNextDisabled, { maxWidth: width * 0.6 }]}
              onPress={canAdvance ? goNext : undefined}
              disabled={!canAdvance}
            >
              <Text style={styles.navNextText}>
                {step === TOTAL_STEPS - 1 ? "Finalizar ✓" : "Siguiente →"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================================
// Paso 1: Género
// ============================================================================
const GenderStep: React.FC<{ gender: Gender | null; onSelect: (g: Gender) => void }> = ({
  gender, onSelect
}) => (
  <View>
    <Text style={styles.stepTitle}>¿Cuál es tu género?</Text>
    <Text style={styles.stepSub}>
      Se usa para calcular tu metabolismo basal (BMR) con la fórmula Mifflin-St Jeor.
    </Text>

    <View style={styles.cardGrid}>
      <GenderCard
        emoji="♂️" label="Masculino" desc="BMR +5"
        active={gender === "male"} onPress={() => onSelect("male")}
      />
      <GenderCard
        emoji="♀️" label="Femenino" desc="BMR −161"
        active={gender === "female"} onPress={() => onSelect("female")}
      />
    </View>
  </View>
);

const GenderCard: React.FC<{
  emoji: string; label: string; desc: string;
  active: boolean; onPress: () => void;
}> = ({ emoji, label, desc, active, onPress }) => (
  <Pressable
    style={[styles.optionCard, active && styles.optionCardActive]}
    onPress={onPress}
  >
    <Text style={[styles.optionEmoji, active && styles.optionEmojiActive]}>{emoji}</Text>
    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
    <Text style={styles.optionDesc}>{desc}</Text>
  </Pressable>
);

// ============================================================================
// Paso 2: Mediciones
// ============================================================================
const MeasurementsStep: React.FC<{
  ageYears: number;
  heightCm: number;
  weightKg: number;
  onAge: (n: number) => void;
  onHeight: (n: number) => void;
  onWeight: (n: number) => void;
}> = ({ ageYears, heightCm, weightKg, onAge, onHeight, onWeight }) => (
  <View>
    <Text style={styles.stepTitle}>Tus medidas</Text>
    <Text style={styles.stepSub}>
      Edad, altura y peso actuales. Puedes cambiarlos después en "Mi perfil".
    </Text>

    <MeasureStepper
      label="Edad" unit="años" value={ageYears}
      onDec={() => onAge(Math.max(10, ageYears - 1))}
      onInc={() => onAge(Math.min(100, ageYears + 1))}
    />
    <MeasureStepper
      label="Altura" unit="cm" value={heightCm}
      onDec={() => onHeight(heightCm - 1)}
      onInc={() => onHeight(heightCm + 1)}
    />
    <MeasureStepper
      label="Peso" unit="kg" value={weightKg}
      onDec={() => onWeight(+(Math.max(30, weightKg - 0.5).toFixed(1)))}
      onInc={() => onWeight(+(Math.min(300, weightKg + 0.5).toFixed(1)))}
      step="0.5"
    />
  </View>
);

const MeasureStepper: React.FC<{
  label: string; unit: string; value: number; step?: string;
  onDec: () => void; onInc: () => void;
}> = ({ label, unit, value, step = "1", onDec, onInc }) => (
  <View style={styles.measureRow}>
    <View>
      <Text style={styles.measureLabel}>{label}</Text>
      <Text style={styles.measureUnit}>{unit}</Text>
    </View>
    <View style={styles.measureStepper}>
      <Pressable style={({ pressed }: { pressed: boolean }) => [styles.measureBtn, pressed && styles.measureBtnPressed]} onPress={onDec}>
        <Text style={styles.measureBtnSign}>−</Text>
        <Text style={styles.measureBtnStep}>{step}</Text>
      </Pressable>
      <Text style={styles.measureValue}>{value}</Text>
      <Pressable style={({ pressed }: { pressed: boolean }) => [styles.measureBtn, pressed && styles.measureBtnPressed]} onPress={onInc}>
        <Text style={styles.measureBtnSign}>+</Text>
        <Text style={styles.measureBtnStep}>{step}</Text>
      </Pressable>
    </View>
  </View>
);

// ============================================================================
// Paso 3: Nivel de actividad
// ============================================================================
const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string; desc: string; emoji: string }> = [
  { value: "sedentary", label: "Sedentario", desc: "Trabajo de oficina, sin ejercicio", emoji: "🪑" },
  { value: "light", label: "Ligero", desc: "Ejercicio 1-3 días/semana", emoji: "🚶" },
  { value: "moderate", label: "Moderado", desc: "Ejercicio 3-5 días/semana", emoji: "🏃" },
  { value: "active", label: "Activo", desc: "Ejercicio 6-7 días/semana", emoji: "💪" },
  { value: "very_active", label: "Muy activo", desc: "Entrenamiento doble / físico", emoji: "🔥" }
];

const ActivityStep: React.FC<{
  activity: ActivityLevel | null;
  onSelect: (a: ActivityLevel) => void;
}> = ({ activity, onSelect }) => (
  <View>
    <Text style={styles.stepTitle}>Nivel de actividad</Text>
    <Text style={styles.stepSub}>
      Se usa para estimar tu gasto calórico diario (TDEE = BMR × factor).
    </Text>
    <View style={styles.chipList}>
      {ACTIVITY_OPTIONS.map((opt) => {
        const active = activity === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.activityChip, active && styles.activityChipActive]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={styles.activityEmoji}>{opt.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.activityLabel, active && styles.activityLabelActive]}>{opt.label}</Text>
              <Text style={styles.activityDesc}>{opt.desc}</Text>
            </View>
            {active && <Text style={styles.activityCheck}>✓</Text>}
          </Pressable>
        );
      })}
    </View>
  </View>
);

// ============================================================================
// Paso 4: Objetivo + resumen
// ============================================================================
const GOAL_OPTIONS: Array<{ value: Goal; emoji: string; label: string; desc: string; kcalDelta: string; protein: string }> = [
  {
    value: "lose",
    emoji: "🔥",
    label: "Perder grasa",
    desc: "Déficit calórico + alta proteína",
    kcalDelta: "−500 kcal/día",
    protein: "2.0 g/kg"
  },
  {
    value: "maintain",
    emoji: "⚖️",
    label: "Mantener",
    desc: "Mantener peso y composición",
    kcalDelta: "Mantener TDEE",
    protein: "1.8 g/kg"
  },
  {
    value: "gain",
    emoji: "💪",
    label: "Ganar músculo",
    desc: "Superávit calórico controlado",
    kcalDelta: "+400 kcal/día",
    protein: "2.2 g/kg"
  }
];

const GoalStep: React.FC<{
  goal: Goal | null;
  onSelect: (g: Goal) => void;
  targets: ReturnType<typeof computeTargets>;
  weightKg: number;
}> = ({ goal, onSelect, targets, weightKg }) => (
  <View>
    <Text style={styles.stepTitle}>Tu objetivo</Text>
    <Text style={styles.stepSub}>
      Define hacia dónde quieres ir. Calcularemos tus metas diarias.
    </Text>

    {GOAL_OPTIONS.map((opt) => {
      const active = goal === opt.value;
      return (
        <Pressable
          key={opt.value}
          style={[styles.goalCard, active && styles.goalCardActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.goalEmoji, active && styles.goalEmojiActive]}>{opt.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.goalLabel, active && styles.goalLabelActive]}>{opt.label}</Text>
            <Text style={styles.goalDesc}>{opt.desc}</Text>
            <View style={styles.goalMetaRow}>
              <Text style={styles.goalMeta}>📊 {opt.kcalDelta}</Text>
              <Text style={styles.goalMeta}>🥩 {opt.protein}</Text>
            </View>
          </View>
          {active && <Text style={styles.goalCheck}>✓</Text>}
        </Pressable>
      );
    })}

    {/* Resumen final con objetivos calculados */}
    {goal && targets.bmrKcal && (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📊 Tus metas diarias</Text>
        <View style={styles.summaryGrid}>
          <SummaryStat
            label="BMR (reposo)" value={targets.bmrKcal} unit="kcal"
            sub="Mifflin-St Jeor"
          />
          <SummaryStat
            label="Calorías objetivo" value={targets.targetKcalDay} unit="kcal/día"
            sub="incluye actividad"
          />
          <SummaryStat
            label="Proteína objetivo" value={targets.targetProteinG} unit="g/día"
            sub={`${(targets.targetProteinG! / Math.max(1, weightKg)).toFixed(1)} g/kg`}
          />
        </View>
        <Text style={styles.summaryNote}>
          Estas cifras aparecerán en la pantalla de Nutrición como tu objetivo de hoy.
        </Text>
      </View>
    )}
  </View>
);

const SummaryStat: React.FC<{
  label: string; value: number | null; unit: string; sub?: string;
}> = ({ label, value, unit, sub }) => (
  <View style={styles.summaryStat}>
    <Text style={styles.summaryStatLabel}>{label}</Text>
    <Text style={styles.summaryStatValue}>{value ?? "—"}</Text>
    <Text style={styles.summaryStatUnit}>{unit}</Text>
    {sub ? <Text style={styles.summaryStatSub}>{sub}</Text> : null}
  </View>
);

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  container: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl
  },

  // Brand
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  brandEmoji: { fontSize: 36 },
  brandTitle: { color: colors.bright, fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  brandSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  // Progress
  progressTrack: { flexDirection: "row", gap: 4, marginBottom: 6 },
  progressSegment: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.dim
  },
  progressSegmentActive: { backgroundColor: colors.accent },
  progressSegmentCurrent: { backgroundColor: colors.accent, height: 6 },
  progressLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: spacing.xl },

  // Step header
  stepTitle: { color: colors.bright, fontSize: 24, fontWeight: "900", marginBottom: spacing.xs },
  stepSub: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: spacing.lg },

  // Step 1 - Gender
  cardGrid: { flexDirection: "row", gap: spacing.md },
  optionCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: "center", borderWidth: 2, borderColor: colors.dim,
    minHeight: 160, justifyContent: "center"
  },
  optionCardActive: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  optionEmoji: { fontSize: 48, marginBottom: spacing.sm },
  optionEmojiActive: { transform: [{ scale: 1.05 }] },
  optionLabel: { color: colors.bright, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  optionLabelActive: { color: colors.accent },
  optionDesc: { color: colors.textMuted, fontSize: 11 },

  // Step 2 - Measurements
  measureRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dim
  },
  measureLabel: { color: colors.bright, fontSize: 16, fontWeight: "800" },
  measureUnit: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  measureStepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  measureBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radius.md,
    minWidth: 64, minHeight: 56, paddingHorizontal: spacing.md
  },
  measureBtnPressed: { backgroundColor: colors.accentDim },
  measureBtnSign: { color: colors.bright, fontSize: 26, fontWeight: "900" },
  measureBtnStep: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  measureValue: {
    color: colors.bright, fontSize: 32, fontWeight: "900", minWidth: 80, textAlign: "center",
    fontVariant: ["tabular-nums"]
  },

  // Step 3 - Activity
  chipList: { gap: spacing.sm },
  activityChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 2, borderColor: colors.dim
  },
  activityChipActive: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  activityEmoji: { fontSize: 28 },
  activityLabel: { color: colors.bright, fontSize: 15, fontWeight: "800" },
  activityLabelActive: { color: colors.accent },
  activityDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  activityCheck: { color: colors.accent, fontSize: 18, fontWeight: "900" },

  // Step 4 - Goals
  goalCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.dim
  },
  goalCardActive: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  goalEmoji: { fontSize: 36 },
  goalEmojiActive: { transform: [{ scale: 1.08 }] },
  goalLabel: { color: colors.bright, fontSize: 17, fontWeight: "800" },
  goalLabelActive: { color: colors.accent },
  goalDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  goalMetaRow: { flexDirection: "row", gap: spacing.lg, marginTop: 6 },
  goalMeta: { color: colors.text, fontSize: 11, fontWeight: "700" },
  goalCheck: { color: colors.accent, fontSize: 22, fontWeight: "900" },

  // Summary card
  summaryCard: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.accent
  },
  summaryTitle: { color: colors.bright, fontSize: 16, fontWeight: "900", marginBottom: spacing.md },
  summaryGrid: { flexDirection: "row", gap: spacing.sm },
  summaryStat: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center"
  },
  summaryStatLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  summaryStatValue: { color: colors.accent, fontSize: 26, fontWeight: "900", marginTop: 4 },
  summaryStatUnit: { color: colors.text, fontSize: 11, fontWeight: "700" },
  summaryStatSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  summaryNote: {
    color: colors.textMuted, fontSize: 11, marginTop: spacing.md,
    lineHeight: 15, textAlign: "center"
  },

  // Nav
  navRow: { flexDirection: "row", gap: spacing.md, alignItems: "stretch" },
  navBack: { flex: 1, paddingVertical: spacing.lg, alignItems: "flex-start", justifyContent: "center" },
  navBackText: { color: colors.textMuted, fontSize: 15, fontWeight: "700" },
  navNext: {
    flex: 2, backgroundColor: colors.accent, paddingVertical: spacing.lg + 2,
    borderRadius: radius.lg, alignItems: "center", justifyContent: "center"
  },
  navNextDisabled: { backgroundColor: colors.dim },
  navNextText: { color: colors.bg, fontSize: 17, fontWeight: "900", letterSpacing: 0.3 }
});
