/**
 * ProfileScreen.tsx (Rediseño v0.4) - NEW
 * ----------------------------------------------------------------------------
 * Pantalla accesible desde "Más → Mi perfil". Muestra:
 *   - Datos del onboarding: altura, peso, edad, género, actividad, objetivo
 *   - BMR (Mifflin-St Jeor) + objetivo kcal + objetivo proteína
 *   - BMI calculado + categoría (bajo peso / normal / sobrepeso / obesidad)
 *   - Rango de peso ideal (BMI 18.5-24.9 sobre la altura)
 *   - Botón "Editar" que re-abre un mini editor inline (steppers + selectors)
 *
 * No persiste directamente; llama a setOnboardingData del settingsStore.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  useSettingsStore, computeTargets,
  type Gender, type Goal, type ActivityLevel
} from "@/store/settingsStore";

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentario",
  light: "Ligero",
  moderate: "Moderado",
  active: "Activo",
  very_active: "Muy activo"
};

const GOAL_LABEL: Record<Goal, string> = {
  lose: "Perder grasa",
  maintain: "Mantener",
  gain: "Ganar músculo"
};

const GENDER_LABEL: Record<Gender, string> = {
  male: "Masculino",
  female: "Femenino"
};

export const ProfileScreen: React.FC = () => {
  const store = useSettingsStore();
  const [editing, setEditing] = useState(false);

  // Estado local de edición
  const [draftGender, setDraftGender] = useState<Gender | null>(store.gender);
  const [draftAge, setDraftAge] = useState<number>(store.ageYears ?? 28);
  const [draftHeight, setDraftHeight] = useState<number>(store.heightCm ?? 170);
  const [draftWeight, setDraftWeight] = useState<number>(store.weightKg ?? 70);
  const [draftActivity, setDraftActivity] = useState<ActivityLevel | null>(store.activityLevel);
  const [draftGoal, setDraftGoal] = useState<Goal | null>(store.goal);

  const bmi = computeBmi(store.heightCm, store.weightKg);
  const idealRange = computeIdealWeightRange(store.heightCm);
  const draftBmi = computeBmi(draftHeight, draftWeight);
  const draftTargets = computeTargets({
    heightCm: draftHeight, weightKg: draftWeight, ageYears: draftAge,
    gender: draftGender, goal: draftGoal, activityLevel: draftActivity
  });

  const openEditor = () => {
    // Sincroniza draft con store
    setDraftGender(store.gender);
    setDraftAge(store.ageYears ?? 28);
    setDraftHeight(store.heightCm ?? 170);
    setDraftWeight(store.weightKg ?? 70);
    setDraftActivity(store.activityLevel);
    setDraftGoal(store.goal);
    setEditing(true);
  };

  const saveDraft = () => {
    if (!draftGender || !draftActivity || !draftGoal) return;
    store.setOnboardingData({
      heightCm: draftHeight, weightKg: draftWeight, ageYears: draftAge,
      gender: draftGender, goal: draftGoal, activityLevel: draftActivity
    });
    setEditing(false);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Cabecera */}
      <View style={styles.headerCard}>
        <Text style={styles.headerEmoji}>
          {store.gender === "female" ? "👩" : store.gender === "male" ? "👨" : "🧑"}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mi perfil</Text>
          <Text style={styles.headerSub}>
            {store.heightCm ? `${store.heightCm} cm · ` : ""}
            {store.weightKg ? `${store.weightKg} kg` : "Sin datos aún"}
          </Text>
        </View>
        <Pressable style={styles.editBtn} onPress={openEditor}>
          <Text style={styles.editBtnText}>Editar</Text>
        </Pressable>
      </View>

      {/* Datos personales */}
      <Text style={styles.sectionTitle}>Datos personales</Text>
      <View style={styles.card}>
        <ProfileRow label="Género" value={store.gender ? GENDER_LABEL[store.gender] : "—"} emoji={store.gender === "female" ? "♀️" : store.gender === "male" ? "♂️" : "🏳️"} />
        <Divider />
        <ProfileRow label="Edad" value={store.ageYears ? `${store.ageYears} años` : "—"} emoji="🎂" />
        <Divider />
        <ProfileRow label="Altura" value={store.heightCm ? `${store.heightCm} cm` : "—"} emoji="📐" />
        <Divider />
        <ProfileRow label="Peso" value={store.weightKg ? `${store.weightKg} kg` : "—"} emoji="⚖️" />
        <Divider />
        <ProfileRow label="Actividad" value={store.activityLevel ? ACTIVITY_LABEL[store.activityLevel] : "—"} emoji="🏃" />
        <Divider />
        <ProfileRow label="Objetivo" value={store.goal ? GOAL_LABEL[store.goal] : "—"} emoji="🎯" />
      </View>

      {/* Métricas calculadas */}
      <Text style={styles.sectionTitle}>Métricas calculadas</Text>
      <View style={styles.statsGrid}>
        <StatCard
          emoji="🔥" label="BMR" value={store.bmrKcal ?? null}
          unit="kcal/día" sub="Mifflin-St Jeor"
        />
        <StatCard
          emoji="📊" label="Calorías objetivo" value={store.targetKcalDay ?? null}
          unit="kcal/día" sub="incluye actividad"
        />
        <StatCard
          emoji="🥩" label="Proteína objetivo" value={store.targetProteinG ?? null}
          unit="g/día" sub={
            store.weightKg && store.targetProteinG
              ? `${(store.targetProteinG / store.weightKg).toFixed(1)} g/kg`
              : undefined
          }
        />
        <StatCard
          emoji="📏" label="BMI" value={bmi?.toFixed(1) ?? null}
          unit="" sub={bmi ? bmiCategory(bmi) : undefined}
        />
      </View>

      {/* Rango de peso ideal */}
      {idealRange && (
        <View style={styles.idealCard}>
          <Text style={styles.cardTitle}>Rango de peso saludable</Text>
          <Text style={styles.idealRangeText}>
            {idealRange.min.toFixed(1)} kg – {idealRange.max.toFixed(1)} kg
          </Text>
          <Text style={styles.idealSub}>
            Para tu altura de {store.heightCm} cm, según BMI 18.5–24.9 (OMS).
          </Text>
        </View>
      )}

      {/* Editor modal */}
      <Modal visible={editing} animationType="slide" transparent={false}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEditing(false)} hitSlop={12}>
              <Text style={styles.closeText}>‹ Cancelar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Editar perfil</Text>
            <View style={{ width: 80 }} />
          </View>

          {/* Género */}
          <Text style={styles.sectionTitle}>Género</Text>
          <View style={styles.row2}>
            <ChoiceCard
              label="Masculino" emoji="♂️" active={draftGender === "male"}
              onPress={() => setDraftGender("male")}
            />
            <ChoiceCard
              label="Femenino" emoji="♀️" active={draftGender === "female"}
              onPress={() => setDraftGender("female")}
            />
          </View>

          {/* Mediciones */}
          <Text style={styles.sectionTitle}>Mediciones</Text>
          <EditStepper label="Edad" unit="años" value={draftAge}
            onDec={() => setDraftAge(Math.max(10, draftAge - 1))}
            onInc={() => setDraftAge(Math.min(100, draftAge + 1))}
          />
          <EditStepper label="Altura" unit="cm" value={draftHeight}
            onDec={() => setDraftHeight(draftHeight - 1)}
            onInc={() => setDraftHeight(draftHeight + 1)}
          />
          <EditStepper label="Peso" unit="kg" value={draftWeight}
            onDec={() => setDraftWeight(+(Math.max(30, draftWeight - 0.5).toFixed(1)))}
            onInc={() => setDraftWeight(+(Math.min(300, draftWeight + 0.5).toFixed(1)))}
            step="0.5"
          />

          {/* Actividad */}
          <Text style={styles.sectionTitle}>Actividad</Text>
          <View style={styles.chipList}>
            {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
              <Pressable
                key={a}
                style={[styles.chip, draftActivity === a && styles.chipActive]}
                onPress={() => setDraftActivity(a)}
              >
                <Text style={[styles.chipLabel, draftActivity === a && styles.chipLabelActive]}>
                  {ACTIVITY_LABEL[a]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Objetivo */}
          <Text style={styles.sectionTitle}>Objetivo</Text>
          <View style={styles.row3}>
            <ChoiceCard label="Perder" emoji="🔥" active={draftGoal === "lose"} onPress={() => setDraftGoal("lose")} />
            <ChoiceCard label="Mantener" emoji="⚖️" active={draftGoal === "maintain"} onPress={() => setDraftGoal("maintain")} />
            <ChoiceCard label="Ganar" emoji="💪" active={draftGoal === "gain"} onPress={() => setDraftGoal("gain")} />
          </View>

          {/* Preview recalculado */}
          {draftTargets.bmrKcal && (
            <View style={styles.previewCard}>
              <Text style={styles.cardTitle}>Recálculo</Text>
              <Text style={styles.previewText}>
                BMR: {draftTargets.bmrKcal} kcal · Objetivo: {draftTargets.targetKcalDay} kcal ·
                Proteína: {draftTargets.targetProteinG} g · BMI: {draftBmi?.toFixed(1) ?? "—"}
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.saveBtn, (!draftGender || !draftActivity || !draftGoal) && styles.saveBtnDisabled]}
            onPress={saveDraft}
            disabled={!draftGender || !draftActivity || !draftGoal}
          >
            <Text style={styles.saveBtnText}>Guardar cambios</Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
};

// ============================================================================
// Subcomponentes
// ============================================================================
const ProfileRow: React.FC<{ label: string; value: string; emoji: string }> = ({ label, value, emoji }) => (
  <View style={styles.profileRow}>
    <Text style={styles.profileEmoji}>{emoji}</Text>
    <Text style={styles.profileLabel}>{label}</Text>
    <Text style={styles.profileValue}>{value}</Text>
  </View>
);

const Divider: React.FC = () => <View style={styles.divider} />;

const StatCard: React.FC<{
  emoji: string; label: string; value: number | string | null;
  unit: string; sub?: string;
}> = ({ emoji, label, value, unit, sub }) => (
  <View style={styles.statCard}>
    <Text style={styles.statEmoji}>{emoji}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value ?? "—"}</Text>
    {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
    {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
  </View>
);

const ChoiceCard: React.FC<{
  label: string; emoji: string; active: boolean; onPress: () => void;
}> = ({ label, emoji, active, onPress }) => (
  <Pressable
    style={[styles.choiceCard, active && styles.choiceCardActive]}
    onPress={onPress}
  >
    <Text style={[styles.choiceEmoji, active && styles.choiceEmojiActive]}>{emoji}</Text>
    <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text>
  </Pressable>
);

const EditStepper: React.FC<{
  label: string; unit: string; value: number; step?: string;
  onDec: () => void; onInc: () => void;
}> = ({ label, unit, value, step = "1", onDec, onInc }) => (
  <View style={styles.editStepperRow}>
    <View>
      <Text style={styles.editLabel}>{label}</Text>
      <Text style={styles.editUnit}>{unit}</Text>
    </View>
    <View style={styles.editStepper}>
      <Pressable style={styles.editBtn2} onPress={onDec}>
        <Text style={styles.editBtn2Sign}>−</Text>
        <Text style={styles.editBtn2Step}>{step}</Text>
      </Pressable>
      <Text style={styles.editValue}>{value}</Text>
      <Pressable style={styles.editBtn2} onPress={onInc}>
        <Text style={styles.editBtn2Sign}>+</Text>
        <Text style={styles.editBtn2Step}>{step}</Text>
      </Pressable>
    </View>
  </View>
);

// ============================================================================
// Helpers
// ============================================================================
function computeBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Sobrepeso";
  return "Obesidad";
}

function computeIdealWeightRange(heightCm: number | null): { min: number; max: number } | null {
  if (!heightCm) return null;
  const m = heightCm / 100;
  return { min: 18.5 * m * m, max: 24.9 * m * m };
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },

  // Header
  headerCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.accent
  },
  headerEmoji: { fontSize: 48 },
  headerTitle: { color: colors.bright, fontSize: 24, fontWeight: "900" },
  headerSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  editBtn: {
    backgroundColor: colors.accent, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.md
  },
  editBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },

  sectionTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md, marginTop: spacing.lg },

  // Card
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.dim },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  profileEmoji: { fontSize: 18 },
  profileLabel: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  profileValue: { color: colors.bright, fontSize: 14, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.dim },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, alignItems: "center",
    borderWidth: 1, borderColor: colors.dim, minHeight: 120
  },
  statEmoji: { fontSize: 24 },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { color: colors.accent, fontSize: 26, fontWeight: "900", marginTop: 4 },
  statUnit: { color: colors.text, fontSize: 11, fontWeight: "700" },
  statSub: { color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: "center" },

  // Ideal card
  idealCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  idealRangeText: { color: colors.bright, fontSize: 22, fontWeight: "900", marginTop: spacing.sm },
  idealSub: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm, lineHeight: 17 },

  // Modal editor
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  closeText: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  modalTitle: { color: colors.bright, fontSize: 20, fontWeight: "800" },

  row2: { flexDirection: "row", gap: spacing.sm },
  row3: { flexDirection: "row", gap: spacing.sm },
  choiceCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: "center", borderWidth: 2, borderColor: colors.dim,
    minHeight: 100, justifyContent: "center"
  },
  choiceCardActive: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  choiceEmoji: { fontSize: 28, marginBottom: 4 },
  choiceEmojiActive: { transform: [{ scale: 1.08 }] },
  choiceLabel: { color: colors.bright, fontSize: 13, fontWeight: "800" },
  choiceLabelActive: { color: colors.accent },

  // Edit stepper
  editStepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim
  },
  editLabel: { color: colors.bright, fontSize: 15, fontWeight: "800" },
  editUnit: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  editStepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  editBtn2: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radius.md,
    minWidth: 60, minHeight: 52, paddingHorizontal: spacing.md
  },
  editBtn2Sign: { color: colors.bright, fontSize: 22, fontWeight: "900" },
  editBtn2Step: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  editValue: { color: colors.bright, fontSize: 28, fontWeight: "900", minWidth: 70, textAlign: "center" },

  // Chips
  chipList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.dim
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  chipLabelActive: { color: colors.bg, fontWeight: "900" },

  // Preview
  previewCard: { backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.accent },
  previewText: { color: colors.bright, fontSize: 13, lineHeight: 18 },

  // Save button
  saveBtn: { backgroundColor: colors.accent, paddingVertical: spacing.lg + 2, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.xl },
  saveBtnDisabled: { backgroundColor: colors.dim },
  saveBtnText: { color: colors.bg, fontSize: 17, fontWeight: "900", letterSpacing: 0.3 }
});
