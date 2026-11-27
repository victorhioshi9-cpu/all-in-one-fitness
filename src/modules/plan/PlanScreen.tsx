/**
 * PlanScreen.tsx — "Mi plan"
 * ----------------------------------------------------------------------------
 * Plan personalizado (calorías, macros, entrenamiento, pasos, sueño) generado
 * a partir del perfil + el % de grasa de la báscula (o el manual).
 * Se recalcula solo cuando cambia el perfil.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, radius } from "@/theme/colors";
import { useSettingsStore } from "@/store/settingsStore";
import { buildPlan, type PersonalPlan } from "./planEngine";
import { readLatestBodyComposition } from "@/modules/health/readers/bodyCompositionReader";

export const PlanScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const s = useSettingsStore();
  const [scaleFat, setScaleFat] = useState<number | null>(s.bodyFatScalePct ?? null);
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);

  // Última composición de la báscula (si hay permisos); si falla se usa lo guardado.
  useEffect(() => {
    let alive = true;
    readLatestBodyComposition(90)
      .then((b) => {
        if (!alive || !b) return;
        if (b.bodyFatPct) { setScaleFat(b.bodyFatPct); useSettingsStore.getState().setScaleBodyFat(b.bodyFatPct); }
        if (b.weightKg) setScaleWeight(b.weightKg);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const plan: PersonalPlan | null = useMemo(() => {
    if (!s.heightCm || !s.weightKg || !s.ageYears || !s.gender || !s.goal || !s.activityLevel) return null;
    return buildPlan({
      weightKg: scaleWeight ?? s.weightKg, heightCm: s.heightCm, ageYears: s.ageYears,
      gender: s.gender, goal: s.goal, activityLevel: s.activityLevel,
      experience: s.experience ?? "intermediate",
      bodyFatPct: s.bodyFatManualPct ?? scaleFat ?? null
    });
  }, [s.heightCm, s.weightKg, s.ageYears, s.gender, s.goal, s.activityLevel, s.experience, s.bodyFatManualPct, scaleFat, scaleWeight]);

  if (!plan) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>Completa tu perfil</Text>
        <Text style={styles.muted}>Necesito género, edad, altura, peso, actividad y objetivo para armar tu plan.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.btnText}>Ir a Mi perfil</Text>
        </Pressable>
      </View>
    );
  }

  const t = plan.training;
  const kgTxt = `${plan.weeklyChangeKg.min > 0 ? "+" : ""}${plan.weeklyChangeKg.min} a ${plan.weeklyChangeKg.max > 0 ? "+" : ""}${plan.weeklyChangeKg.max} kg/semana`;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.h1}>🎯 {plan.goalLabel}</Text>
      <Text style={styles.headline}>{plan.headline}</Text>

      {plan.warnings.map((w, i) => (
        <View key={i} style={styles.warn}><Text style={styles.warnText}>⚠️ {w}</Text></View>
      ))}

      {/* Composición */}
      <View style={styles.grid}>
        <Stat label="IMC" value={`${plan.bmi}`} sub={plan.bmiCategory} />
        <Stat label="% Grasa" value={plan.bodyFatPct ? `${plan.bodyFatPct.toFixed(1)}%` : "—"} sub={plan.bodyFatPct ? (s.bodyFatManualPct ? "manual" : "báscula") : "sin dato"} />
        <Stat label="Masa magra" value={plan.leanMassKg ? `${plan.leanMassKg} kg` : "—"} />
        <Stat label="Ritmo esperado" value={kgTxt} small />
      </View>

      {/* Nutrición */}
      <Text style={styles.h2}>🍽 Nutrición diaria</Text>
      <View style={styles.card}>
        <Row k="Metabolismo basal" v={`${plan.calories.bmr} kcal`} />
        <Row k="Gasto total estimado" v={`${plan.calories.tdee} kcal`} />
        <Row k="Objetivo" v={`${plan.calories.target} kcal (${plan.calories.delta >= 0 ? "+" : ""}${plan.calories.delta})`} bold />
        <View style={styles.sep} />
        <Row k="Proteína" v={`${plan.macros.proteinG} g`} />
        <Row k="Carbohidratos" v={`${plan.macros.carbsG} g`} />
        <Row k="Grasas" v={`${plan.macros.fatG} g`} />
        <Row k="Fibra" v={`${plan.macros.fiberG} g`} />
        <Row k="Agua" v={`${plan.waterLiters} L`} />
      </View>

      {/* Entrenamiento */}
      <Text style={styles.h2}>🏋️ Entrenamiento · {t.splitName}</Text>
      <View style={styles.card}>
        <Row k="Días / semana" v={`${t.daysPerWeek}`} />
        <Row k="Repeticiones" v={t.repRange} />
        <Row k="Volumen" v={t.setsPerMuscleWeek} />
        <Row k="Descanso" v={t.restSeconds} />
        <Text style={styles.small}>{t.effort}</Text>
        <Text style={styles.small}>{t.progression}</Text>
      </View>
      {t.days.map((d, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.dayTitle}>{d.title} · <Text style={styles.muted}>{d.focus}</Text></Text>
          {d.exercises.map((e, j) => (
            <View key={j} style={styles.exRow}>
              <Text style={styles.exName}>{e.name}</Text>
              <Text style={styles.exSets}>{e.sets} × {e.reps}</Text>
            </View>
          ))}
        </View>
      ))}

      {/* Actividad y recuperación */}
      <Text style={styles.h2}>🚶 Actividad y recuperación</Text>
      <View style={styles.card}>
        <Row k="Pasos diarios" v={plan.stepsTarget.toLocaleString()} />
        <Row k="Sueño" v={plan.sleepHours} />
        <Text style={styles.small}>{plan.cardio}</Text>
      </View>

      {plan.notes.map((n, i) => (
        <Text key={i} style={styles.note}>💡 {n}</Text>
      ))}

      <Pressable style={styles.btn} onPress={() => navigation.navigate("Physique")}>
        <Text style={styles.btnText}>📸 Analizar mi físico con foto</Text>
      </Pressable>
      <Text style={styles.disclaimer}>
        Guía general basada en tus datos; no sustituye a un médico, nutricionista o entrenador.
      </Text>
    </ScrollView>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; small?: boolean }> = ({ label, value, sub, small }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, small && { fontSize: 13 }]}>{value}</Text>
    {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
  </View>
);

const Row: React.FC<{ k: string; v: string; bold?: boolean }> = ({ k, v, bold }) => (
  <View style={styles.row}>
    <Text style={styles.rowK}>{k}</Text>
    <Text style={[styles.rowV, bold && { color: colors.accent }]}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  h1: { color: colors.bright, fontSize: 24, fontWeight: "800" },
  headline: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.md, lineHeight: 19 },
  h2: { color: colors.bright, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  warn: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)", borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  warnText: { color: colors.bright, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { width: "48%", backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, padding: spacing.md, alignItems: "center" },
  statLabel: { color: colors.textMuted, fontSize: 11 },
  statValue: { color: colors.bright, fontSize: 20, fontWeight: "900", marginTop: 2, textAlign: "center" },
  statSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dim, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  rowK: { color: colors.textMuted, fontSize: 13, flex: 1 },
  rowV: { color: colors.bright, fontSize: 14, fontWeight: "700", flex: 1.2, textAlign: "right" },
  sep: { height: 1, backgroundColor: colors.dim, marginVertical: spacing.sm },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  dayTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", marginBottom: spacing.sm },
  exRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  exName: { color: colors.bright, fontSize: 13, flex: 1 },
  exSets: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.lg },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  disclaimer: { color: colors.dim, fontSize: 11, textAlign: "center", marginTop: spacing.md }
});
