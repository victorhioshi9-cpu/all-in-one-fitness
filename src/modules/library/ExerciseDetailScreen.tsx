/**
 * ExerciseDetailScreen.tsx - Detalle de un ejercicio:
 * cuerpo con músculos principal/secundario, técnica clave, tu historial y
 * botón para entrenarlo con el Coach AI.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, radius, spacing, type } from "@/theme/colors";
import { EXERCISE_PRESETS } from "@/modules/biomechanics/exercisePresets";
import { BodyMap, BodyViewToggle } from "@/modules/muscles/BodyMap";
import type { BodyView } from "@/modules/muscles/bodyPaths";
import {
  getExerciseMuscles, exerciseLevel, viewForMuscles, exercisesForMuscle,
  MUSCLE_LABEL, CATEGORY_LABEL
} from "@/modules/muscles/muscles";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { Card, Chip, PrimaryButton, SectionHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CATEGORY_ICON, LEVEL_COLOR } from "./ExerciseLibraryScreen";

interface SetRow { weight_kg: number; reps: number; est_1rm_kg: number | null; created_at: number }

export const ExerciseDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const exerciseId: string = route.params?.exerciseId;
  const ex = EXERCISE_PRESETS[exerciseId];

  const muscles = useMemo(() => (ex ? getExerciseMuscles(ex) : null), [ex]);
  const [view, setView] = useState<BodyView>(muscles ? viewForMuscles(muscles.primary) : "front");
  const [history, setHistory] = useState<SetRow[]>([]);
  const [best1rm, setBest1rm] = useState<number | null>(null);

  useEffect(() => {
    if (muscles) setView(viewForMuscles(muscles.primary));
  }, [exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const db = await openDatabase();
        const rows = await queryAsync<SetRow>(
          db,
          `SELECT weight_kg, reps, est_1rm_kg, created_at FROM sets
           WHERE exercise_id = ? ORDER BY created_at DESC LIMIT 5`,
          [exerciseId]
        );
        setHistory(rows);
        const best = await queryAsync<{ b: number | null }>(
          db, `SELECT MAX(est_1rm_kg) as b FROM sets WHERE exercise_id = ?`, [exerciseId]
        );
        setBest1rm(best[0]?.b ?? null);
      } catch (err) {
        console.warn("[ExerciseDetail] historial falló:", err);
      }
    })();
  }, [exerciseId]);

  const related = useMemo(() => {
    if (!muscles || muscles.primary.length === 0) return [];
    return exercisesForMuscle(muscles.primary[0]).filter((e) => e.id !== exerciseId).slice(0, 8);
  }, [muscles, exerciseId]);

  if (!ex || !muscles) {
    return (
      <View style={styles.screen}>
        <Text style={{ color: colors.textMuted, padding: spacing.lg }}>Ejercicio no encontrado.</Text>
      </View>
    );
  }

  const level = exerciseLevel(ex.id);
  const launchCoach = () => {
    navigation.navigate("Main", { screen: "Coach", params: { exerciseId: ex.id, nonce: Date.now() } });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{ex.name}</Text>
      <View style={styles.chipsRow}>
        <Chip label={CATEGORY_LABEL[ex.category]} icon={CATEGORY_ICON[ex.category]} />
        <Chip label={level} color={LEVEL_COLOR[level]} active />
      </View>

      <Card style={{ marginTop: spacing.lg, alignItems: "center" }} elevated>
        <BodyViewToggle view={view} onChange={setView} />
        <View style={{ marginTop: spacing.md }}>
          <BodyMap view={view} width={200} primary={muscles.primary} secondary={muscles.secondary} />
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>Principal</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.muscleSecondary }]} />
            <Text style={styles.legendText}>Secundario</Text>
          </View>
        </View>
        {muscles.cardio && (
          <Text style={styles.cardioNote}>Ejercicio de cuerpo completo / cardio</Text>
        )}
      </Card>

      <SectionHeader title="Músculos trabajados" />
      <View style={styles.chipsRow}>
        {muscles.primary.map((m) => <Chip key={m} label={MUSCLE_LABEL[m]} active />)}
        {muscles.secondary.map((m) => <Chip key={m} label={MUSCLE_LABEL[m]} />)}
      </View>

      <SectionHeader title="Técnica clave" />
      <Card style={styles.tipCard}>
        <Icon name="bulb-outline" size={22} color={colors.bottom} />
        <Text style={styles.tipText}>{ex.calibrationHint}</Text>
      </Card>

      <SectionHeader title="Tu historial" />
      <Card>
        {history.length === 0 ? (
          <Text style={styles.muted}>Aún no has registrado series de este ejercicio.</Text>
        ) : (
          <>
            {best1rm ? (
              <View style={styles.prRow}>
                <Icon name="trophy-outline" size={18} color={colors.bottom} />
                <Text style={styles.prText}>1RM estimado: {Math.round(best1rm)} kg</Text>
              </View>
            ) : null}
            {history.map((h, i) => (
              <View key={i} style={styles.histRow}>
                <Text style={styles.histDate}>{new Date(h.created_at).toLocaleDateString()}</Text>
                <Text style={styles.histVal}>{h.weight_kg} kg × {h.reps}</Text>
              </View>
            ))}
          </>
        )}
      </Card>

      {related.length > 0 && (
        <>
          <SectionHeader title="Ejercicios similares" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {related.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => navigation.push("ExerciseDetail", { exerciseId: r.id })}
                style={styles.relCard}
              >
                <Icon name={CATEGORY_ICON[r.category]} size={20} color={colors.accent} />
                <Text style={styles.relName} numberOfLines={2}>{r.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <PrimaryButton
        label="Entrenar con Coach AI"
        icon="camera-outline"
        onPress={launchCoach}
        style={{ marginTop: spacing.xl }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { ...type.display, color: colors.bright, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  legend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  cardioNote: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  tipCard: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  tipText: { color: colors.text, flex: 1, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.textMuted },
  prRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.md },
  prText: { color: colors.bright, fontWeight: "800", fontSize: 15 },
  histRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.line
  },
  histDate: { color: colors.textMuted, fontSize: 13 },
  histVal: { color: colors.bright, fontWeight: "700", fontSize: 14 },
  relCard: {
    width: 120, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.line, gap: 8
  },
  relName: { color: colors.text, fontSize: 13, fontWeight: "700" }
});
