/**
 * HomeScreen.tsx - Pantalla de Inicio (Rediseño v0.5).
 * Resumen del día: saludo + racha, rutina de hoy, anillos (kcal, proteína,
 * pasos, sueño), readiness, recuperación muscular y accesos rápidos.
 * Cada bloque carga por separado: si Health Connect falla, el resto sigue.
 */
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/theme/colors";
import { useSettingsStore } from "@/store/settingsStore";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { todayISO } from "@/modules/intelligence/dateUtils";
import { computeReadiness, type ReadinessResult } from "@/modules/intelligence/readiness";
import { readStepsForDay } from "@/modules/health/readers/stepsReader";
import { readSleepForDay } from "@/modules/health/readers/sleepReader";
import { ROUTINES_BY_DAY, estimateRoutineMinutes, type Routine } from "@/modules/entrenos/routineLibrary";
import { getExerciseMuscles, viewForMuscles, MUSCLE_LABEL, type MuscleId } from "@/modules/muscles/muscles";
import { BodyMap } from "@/modules/muscles/BodyMap";
import { MuscleRecoveryCard } from "@/modules/muscles/MuscleRecoveryCard";
import { Card, SectionHeader, ProgressRing, PrimaryButton } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const STEP_GOAL = 10000;
const SLEEP_GOAL_H = 8;

/** Fecha/hora "de Lima" (UTC-5, sin DST), igual que el resto de la app. */
const limaNow = () => new Date(Date.now() - 5 * 3600 * 1000);
const limaDayName = () => DAY_NAMES[limaNow().getUTCDay()];
const limaISO = (d: Date) => d.toISOString().slice(0, 10);

function greeting(): string {
  const h = limaNow().getUTCHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const READINESS_META: Record<ReadinessResult["level"], { label: string; color: string }> = {
  optimal: { label: "Óptimo", color: colors.ok },
  good: { label: "Bueno", color: colors.concentric },
  moderate: { label: "Moderado", color: colors.warning },
  low: { label: "Bajo", color: colors.error }
};

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const targetKcal = useSettingsStore((s) => s.targetKcalDay) ?? 2200;
  const targetProtein = useSettingsStore((s) => s.targetProteinG) ?? 120;

  const [refreshing, setRefreshing] = useState(false);
  const [kcal, setKcal] = useState(0);
  const [protein, setProtein] = useState(0);
  const [steps, setSteps] = useState<number | null>(null);
  const [sleepH, setSleepH] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [streak, setStreak] = useState(0);

  const todayRoutine: Routine | undefined = ROUTINES_BY_DAY[limaDayName()];

  const load = useCallback(async () => {
    setRefreshing(true);
    const day = todayISO();
    await Promise.allSettled([
      (async () => {
        const db = await openDatabase();
        const r = await queryAsync<{ k: number; p: number }>(
          db,
          `SELECT COALESCE(SUM(kcal),0) as k, COALESCE(SUM(protein_g),0) as p
           FROM nutrition_logs WHERE day = ?`, [day]
        );
        setKcal(r[0]?.k ?? 0);
        setProtein(r[0]?.p ?? 0);
      })(),
      (async () => {
        const db = await openDatabase();
        const rows = await queryAsync<{ d: string }>(
          db,
          `SELECT DISTINCT date(created_at/1000,'unixepoch','-5 hours') as d
           FROM sets ORDER BY d DESC LIMIT 90`, []
        );
        const days = new Set(rows.map((r) => r.d));
        let n = 0;
        const cur = limaNow();
        if (!days.has(limaISO(cur))) cur.setUTCDate(cur.getUTCDate() - 1); // hoy aún puede no haber entrenado
        while (days.has(limaISO(cur))) { n++; cur.setUTCDate(cur.getUTCDate() - 1); }
        setStreak(n);
      })(),
      readStepsForDay(day).then((r) => setSteps(r ? Math.round(r.value) : null)),
      readSleepForDay(day).then((s) => setSleepH(s ? s.asleepMs / 3600_000 : null)),
      computeReadiness().then(setReadiness)
    ]);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Músculos de la rutina de hoy
  const routineMuscles: MuscleId[] = React.useMemo(() => {
    if (!todayRoutine) return [];
    const set = new Set<MuscleId>();
    todayRoutine.blocks.forEach((b) => getExerciseMuscles(b.exerciseId).primary.forEach((m) => set.add(m)));
    return Array.from(set);
  }, [todayRoutine]);

  const startRoutineWithCoach = () => {
    const first = todayRoutine?.blocks[0]?.exerciseId;
    if (first) navigation.navigate("Coach", { exerciseId: first, nonce: Date.now() });
    else navigation.navigate("Workouts");
  };

  const rMeta = readiness ? READINESS_META[readiness.level] : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
    >
      {/* Cabecera */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.display}>Tu día</Text>
        </View>
        {streak > 0 && (
          <View style={styles.streak}>
            <Icon name="flame" size={16} color={colors.accent} />
            <Text style={styles.streakText}>{streak} {streak === 1 ? "día" : "días"}</Text>
          </View>
        )}
        <Pressable onPress={() => navigation.navigate("More")} style={styles.menuBtn} hitSlop={8}>
          <Icon name="ellipsis-horizontal" size={20} color={colors.bright} />
        </Pressable>
      </View>

      {/* Rutina de hoy */}
      {todayRoutine && (
        <Card style={styles.routineCard} elevated>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>HOY TOCA · {limaDayName().toUpperCase()}</Text>
            <Text style={styles.routineName}>{todayRoutine.name}</Text>
            <Text style={styles.routineMeta}>
              {todayRoutine.focus} · {estimateRoutineMinutes(todayRoutine)} min · {todayRoutine.blocks.length} ejercicios
            </Text>
            {routineMuscles.length > 0 && (
              <Text style={styles.routineMuscles} numberOfLines={2}>
                {routineMuscles.map((m) => MUSCLE_LABEL[m]).join(" · ")}
              </Text>
            )}
            <View style={styles.routineBtns}>
              <PrimaryButton label="Empezar" icon="play" onPress={startRoutineWithCoach} style={{ flex: 1, paddingVertical: 11 }} />
              <PrimaryButton label="Ver" variant="ghost" onPress={() => navigation.navigate("Workouts")} style={{ paddingVertical: 11 }} />
            </View>
          </View>
          <BodyMap view={viewForMuscles(routineMuscles)} width={92} primary={routineMuscles} />
        </Card>
      )}

      {/* Anillos */}
      <SectionHeader title="Hoy en números" />
      <Card style={styles.rings}>
        <RingItem label="Calorías" value={`${Math.round(kcal)}`} sub={`/ ${Math.round(targetKcal)}`}
          progress={kcal / targetKcal} gradient={colors.gradientPrimary} />
        <RingItem label="Proteína" value={`${Math.round(protein)}g`} sub={`/ ${Math.round(targetProtein)}g`}
          progress={protein / targetProtein} gradient={["#ef4444", "#f97316"]} />
        <RingItem label="Pasos" value={steps === null ? "—" : steps.toLocaleString("es-PE")} sub={`/ ${STEP_GOAL / 1000}k`}
          progress={(steps ?? 0) / STEP_GOAL} gradient={["#06b6d4", "#3b82f6"]} />
        <RingItem label="Sueño" value={sleepH === null ? "—" : `${sleepH.toFixed(1)}h`} sub={`/ ${SLEEP_GOAL_H}h`}
          progress={(sleepH ?? 0) / SLEEP_GOAL_H} gradient={["#a855f7", "#6366f1"]} />
      </Card>

      {/* Readiness */}
      <Pressable onPress={() => navigation.navigate("Readiness")}>
        <Card style={styles.readinessCard}>
          <ProgressRing
            size={64} stroke={7}
            progress={(readiness?.totalScore ?? 0) / 100}
            gradient={[rMeta?.color ?? colors.dim, rMeta?.color ?? colors.dim]}
            label={readiness ? `${Math.round(readiness.totalScore)}` : "—"}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>READINESS</Text>
            <Text style={[styles.readinessLevel, rMeta && { color: rMeta.color }]}>
              {rMeta?.label ?? "Sin datos aún"}
            </Text>
            {readiness && <Text style={styles.readinessText} numberOfLines={2}>{readiness.recommendation}</Text>}
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textDim} />
        </Card>
      </Pressable>

      {/* Recuperación muscular */}
      <SectionHeader title="Tu cuerpo" action="Ver ejercicios" onAction={() => navigation.navigate("Library")} />
      <MuscleRecoveryCard />

      {/* Accesos rápidos */}
      <SectionHeader title="Accesos rápidos" />
      <View style={styles.grid}>
        <Shortcut icon="flag-outline" label="Mi plan" onPress={() => navigation.navigate("Plan")} />
        <Shortcut icon="heart-outline" label="Salud" onPress={() => navigation.navigate("Health")} />
        <Shortcut icon="calendar-outline" label="Calendario" onPress={() => navigation.navigate("Calendar")} />
        <Shortcut icon="bulb-outline" label="Consejos" onPress={() => navigation.navigate("Recommendations")} />
      </View>
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
const RingItem: React.FC<{
  label: string; value: string; sub: string; progress: number; gradient: [string, string];
}> = ({ label, value, sub, progress, gradient }) => (
  <View style={styles.ringItem}>
    <ProgressRing size={70} stroke={8} progress={progress} gradient={gradient} />
    <Text style={styles.ringValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={styles.ringSub}>{sub}</Text>
    <Text style={styles.ringLabel}>{label}</Text>
  </View>
);

const Shortcut: React.FC<{ icon: IconName; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.8 }]}>
    <View style={styles.shortcutIcon}><Icon name={icon} size={22} color={colors.accent} /></View>
    <Text style={styles.shortcutLabel}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.xl + 8, paddingBottom: 48 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  greeting: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  display: { ...type.display, color: colors.bright },
  streak: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentDim,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.xl
  },
  streakText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line
  },
  overline: { ...type.overline, color: colors.accent },
  routineCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.lg },
  routineName: { ...type.title, color: colors.bright, marginTop: 4 },
  routineMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  routineMuscles: { color: colors.text, fontSize: 12, marginTop: 6 },
  routineBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  rings: { flexDirection: "row", justifyContent: "space-between" },
  ringItem: { alignItems: "center", width: "24%" },
  ringValue: { color: colors.bright, fontWeight: "800", fontSize: 14, marginTop: 8 },
  ringSub: { color: colors.textDim, fontSize: 10 },
  ringLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  readinessCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  readinessLevel: { ...type.heading, color: colors.bright, marginTop: 2 },
  readinessText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  shortcut: {
    width: "48.5%", flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.line
  },
  shortcutIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentDim,
    alignItems: "center", justifyContent: "center"
  },
  shortcutLabel: { color: colors.bright, fontWeight: "700", fontSize: 14 }
});
