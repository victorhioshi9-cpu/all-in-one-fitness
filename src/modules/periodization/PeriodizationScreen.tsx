/**
 * PeriodizationScreen.tsx
 * ----------------------------------------------------------------------------
 * Bloques de Objetivos (Periodización).
 *   - Crea ciclos de X semanas con metas (peso, kcal deficit, pasos, volumen).
 *   - Muestra el progreso actual vs meta.
 *   - Calcula semanas restantes y proyección de peso.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";
import { computeWeightTrend } from "@/modules/intelligence/weightTrend";
import { toLocalISO } from "@/modules/intelligence/dateUtils";

const GOAL_OPTIONS = [
  { value: "deficit", label: "Déficit", color: colors.ok },
  { value: "recomp", label: "Recomposición", color: colors.concentric },
  { value: "volume", label: "Volumen", color: colors.bottom },
  { value: "maintenance", label: "Mantenimiento", color: colors.textMuted }
];

export const PeriodizationScreen: React.FC = () => {
  const [cycles, setCycles] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [trend, setTrend] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", goal: "deficit", weeks: "8", target_weight_kg: "",
    target_weekly_kcal: "-3500", target_steps_per_day: "8000",
    target_protein_g_kg: "2.0", target_volume_kg_week: ""
  });

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const db = await openDatabase();
    const rows = await queryAsync<any>(db, "SELECT * FROM periodization_cycles WHERE is_active = 1 ORDER BY start_date DESC", []);
    setCycles(rows);
    try {
      const t = await computeWeightTrend();
      setTrend(t);
    } catch {}
  }

  async function saveCycle() {
    if (!form.name || !form.weeks) return;
    const db = await openDatabase();
    const id = `cyc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    await execAsync(
      db,
      `INSERT INTO periodization_cycles
        (id, name, goal, start_date, weeks, target_weight_kg, target_weekly_kcal,
         target_steps_per_day, target_protein_g_kg, target_volume_kg_week,
         notes, is_active, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL)`,
      [id, form.name, form.goal, toLocalISO(new Date()), parseInt(form.weeks),
       form.target_weight_kg ? parseFloat(form.target_weight_kg) : null,
       parseFloat(form.target_weekly_kcal),
       parseInt(form.target_steps_per_day),
       parseFloat(form.target_protein_g_kg),
       form.target_volume_kg_week ? parseFloat(form.target_volume_kg_week) : null,
       now, now]
    );
    setShowCreate(false);
    refresh();
  }

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.container}>
        <Text style={styles.title}>Periodización</Text>
        <Text style={styles.subtitle}>Crea ciclos de X semanas con metas</Text>

        {trend && (
          <View style={styles.trendCard}>
            <Text style={styles.cardTitle}>Peso actual</Text>
            <Text style={styles.trendValue}>{trend.smoothedTodayKg.toFixed(1)} kg</Text>
            <Text style={[styles.trendDelta, { color: trend.weeklyTrendKg <= 0 ? colors.ok : colors.bottom }]}>
              {trend.weeklyTrendKg >= 0 ? "+" : ""}{trend.weeklyTrendKg.toFixed(2)} kg/sem
            </Text>
          </View>
        )}

        {cycles.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No tienes ciclos activos. Crea uno para empezar a planificar tu objetivo.</Text>
          </View>
        )}

        {cycles.map(c => {
          const weeksElapsed = Math.floor((Date.now() - new Date(c.start_date).getTime()) / (7 * 86400_000));
          const weeksLeft = c.weeks - weeksElapsed;
          const goalColor = GOAL_OPTIONS.find(g => g.value === c.goal)?.color ?? colors.bright;
          return (
            <View key={c.id} style={[styles.cycleCard, { borderLeftColor: goalColor }]}>
              <Text style={styles.cycleName}>{c.name}</Text>
              <View style={styles.cycleMetaRow}>
                <Text style={[styles.cycleGoal, { color: goalColor }]}>
                  {GOAL_OPTIONS.find(g => g.value === c.goal)?.label?.toUpperCase()}
                </Text>
                <Text style={styles.cycleWeeks}>
                  Semana {Math.max(1, weeksElapsed + 1)} / {c.weeks} ({weeksLeft} restantes)
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (weeksElapsed / c.weeks) * 100)}%`, backgroundColor: goalColor }]} />
              </View>
              <View style={styles.targetsRow}>
                {c.target_weight_kg && <Target label="Peso meta" value={`${c.target_weight_kg} kg`} />}
                {c.target_weekly_kcal && <Target label="Balance sem." value={`${c.target_weekly_kcal} kcal`} />}
                {c.target_steps_per_day && <Target label="Pasos/día" value={`${c.target_steps_per_day}`} />}
                {c.target_protein_g_kg && <Target label="Proteína" value={`${c.target_protein_g_kg} g/kg`} />}
              </View>
            </View>
          );
        })}

        <Pressable style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.createBtnText}>+ Nuevo ciclo</Text>
        </Pressable>

        <Modal visible={showCreate} animationType="slide" transparent={false}>
          <ScrollView style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Nuevo ciclo de periodización</Text>
            <LabeledInput label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Ej: Cut primavera 2026" />
            <Text style={styles.inputLabel}>Objetivo</Text>
            <View style={styles.goalRow}>
              {GOAL_OPTIONS.map(g => (
                <Pressable
                  key={g.value}
                  style={[styles.goalBtn, { borderColor: g.color }, form.goal === g.value && { backgroundColor: g.color + "33" }]}
                  onPress={() => setForm({ ...form, goal: g.value })}
                >
                  <Text style={[styles.goalBtnText, { color: form.goal === g.value ? g.color : colors.textMuted }]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
            <LabeledInput label="Semanas" value={form.weeks} onChangeText={(v) => setForm({ ...form, weeks: v })} keyboardType="numeric" />
            <LabeledInput label="Peso meta (kg)" value={form.target_weight_kg} onChangeText={(v) => setForm({ ...form, target_weight_kg: v })} keyboardType="numeric" />
            <LabeledInput label="Balance kcal semanal (negativo=déficit)" value={form.target_weekly_kcal} onChangeText={(v) => setForm({ ...form, target_weekly_kcal: v })} keyboardType="numeric" />
            <LabeledInput label="Pasos/día meta" value={form.target_steps_per_day} onChangeText={(v) => setForm({ ...form, target_steps_per_day: v })} keyboardType="numeric" />
            <LabeledInput label="Proteína g/kg" value={form.target_protein_g_kg} onChangeText={(v) => setForm({ ...form, target_protein_g_kg: v })} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={saveCycle}>
                <Text style={styles.confirmText}>Crear ciclo</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Modal>
      </View>
    </ScrollView>
  );
};

const Target: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.targetBox}>
    <Text style={styles.targetLabel}>{label}</Text>
    <Text style={styles.targetValue}>{value}</Text>
  </View>
);

const LabeledInput: React.FC<{ label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any }> = ({ label, value, onChangeText, placeholder, keyboardType }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboardType} />
  </View>
);

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.lg },
  trendCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  cardTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  trendValue: { color: colors.bright, fontSize: 32, fontWeight: "900" },
  trendDelta: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  emptyCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  emptyText: { color: colors.textMuted, textAlign: "center", fontSize: 14 },
  cycleCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim, borderLeftWidth: 4 },
  cycleName: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  cycleMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: spacing.sm },
  cycleGoal: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  cycleWeeks: { color: colors.textMuted, fontSize: 12 },
  progressBar: { height: 6, backgroundColor: colors.dim, borderRadius: 3, overflow: "hidden", marginBottom: spacing.md },
  progressBarFill: { height: "100%" },
  targetsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  targetBox: { backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm, borderRadius: radius.sm, minWidth: 80 },
  targetLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  targetValue: { color: colors.bright, fontSize: 13, fontWeight: "800", marginTop: 2 },
  createBtn: { backgroundColor: colors.accent, paddingVertical: spacing.lg, borderRadius: radius.lg, alignItems: "center" },
  createBtnText: { color: "#08080c", fontWeight: "800", fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalTitle: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.lg },
  inputGroup: { marginBottom: spacing.md },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4, letterSpacing: 0.5 },
  input: { backgroundColor: colors.bgCard, color: colors.bright, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, fontSize: 15 },
  goalRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  goalBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  goalBtnText: { fontWeight: "800", fontSize: 13 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  cancelText: { color: colors.bright, fontWeight: "700" },
  confirmBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  confirmText: { color: "#08080c", fontWeight: "800" }
});
