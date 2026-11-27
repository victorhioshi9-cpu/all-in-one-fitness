/**
 * ExerciseLibraryScreen.tsx - Biblioteca de ejercicios con cuerpo interactivo.
 * Toca un músculo -> se filtran los ejercicios que lo trabajan.
 */
import React, { useMemo, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/theme/colors";
import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";
import { BodyMap, BodyViewToggle } from "@/modules/muscles/BodyMap";
import type { BodyView } from "@/modules/muscles/bodyPaths";
import {
  getExerciseMuscles, exerciseLevel, MUSCLE_LABEL, MUSCLE_VIEWS, CATEGORY_LABEL,
  type MuscleId
} from "@/modules/muscles/muscles";
import { Icon, type IconName } from "@/components/Icon";
import { Chip } from "@/components/ui";

export const CATEGORY_ICON: Record<ExercisePreset["category"], IconName> = {
  free_weight: "barbell-outline",
  machine: "settings-outline",
  cable: "link-outline",
  calisthenic: "body-outline",
  cardio: "flame-outline"
};

export const LEVEL_COLOR = {
  principiante: colors.ok,
  intermedio: colors.bottom,
  avanzado: colors.error
} as const;

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type Category = ExercisePreset["category"] | "all";
const CATEGORIES: Category[] = ["all", "free_weight", "machine", "cable", "calisthenic", "cardio"];

export const ExerciseLibraryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<BodyView>("front");
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");

  const onSelectMuscle = (id: MuscleId) => {
    setMuscle((cur) => (cur === id ? null : id));
  };

  const onChangeView = (v: BodyView) => {
    setView(v);
    // Si el músculo seleccionado no existe en la otra vista, se limpia.
    if (muscle && !MUSCLE_VIEWS[muscle].includes(v)) setMuscle(null);
  };

  const data = useMemo(() => {
    const q = strip(query.trim());
    const rows = Object.values(EXERCISE_PRESETS)
      .map((ex) => ({ ex, m: getExerciseMuscles(ex) }))
      .filter(({ ex, m }) => {
        if (category !== "all" && ex.category !== category) return false;
        if (q && !strip(ex.name).includes(q) && !strip(ex.primaryMuscle ?? "").includes(q)) return false;
        if (muscle && !m.primary.includes(muscle) && !m.secondary.includes(muscle)) return false;
        return true;
      })
      .map(({ ex, m }) => ({
        ex, m, isSecondary: !!muscle && !m.primary.includes(muscle)
      }));
    // Primero los que trabajan el músculo como principal.
    rows.sort((a, b) => Number(a.isSecondary) - Number(b.isSecondary) || a.ex.name.localeCompare(b.ex.name));
    return rows;
  }, [query, muscle, category]);

  const header = (
    <View>
      <Text style={styles.title}>Ejercicios</Text>
      <Text style={styles.subtitle}>Toca un músculo para ver qué ejercicios lo trabajan</Text>

      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar ejercicio o músculo"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Icon name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.bodyCard}>
        <BodyViewToggle view={view} onChange={onChangeView} />
        <View style={{ alignItems: "center", marginTop: spacing.md }}>
          <BodyMap view={view} width={190} selected={muscle} onSelect={onSelectMuscle} />
        </View>
        <View style={styles.selectedRow}>
          {muscle ? (
            <Pressable onPress={() => setMuscle(null)} style={styles.selectedPill}>
              <Text style={styles.selectedText}>{MUSCLE_LABEL[muscle]}</Text>
              <Icon name="close" size={14} color="#08080c" />
            </Pressable>
          ) : (
            <Text style={styles.hint}>Sin filtro · mostrando todos</Text>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={c === "all" ? "Todos" : CATEGORY_LABEL[c]}
            icon={c === "all" ? "apps-outline" : CATEGORY_ICON[c]}
            active={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </ScrollView>

      <Text style={styles.count}>{data.length} ejercicios</Text>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      data={data}
      keyExtractor={(r) => r.ex.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={styles.empty}>No hay ejercicios con ese filtro.</Text>}
      renderItem={({ item }) => {
        const { ex, m, isSecondary } = item;
        const level = exerciseLevel(ex.id);
        return (
          <Pressable
            onPress={() => navigation.navigate("ExerciseDetail", { exerciseId: ex.id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.rowIcon}>
              <Icon name={CATEGORY_ICON[ex.category]} size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{ex.name}</Text>
              <Text style={styles.rowMuscles} numberOfLines={1}>
                {m.primary.length
                  ? m.primary.map((p) => MUSCLE_LABEL[p]).join(" · ")
                  : (ex.primaryMuscle || "Cuerpo completo")}
                {isSecondary ? "  (secundario)" : ""}
              </Text>
            </View>
            <View style={[styles.levelDot, { backgroundColor: LEVEL_COLOR[level] }]} />
            <Icon name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { ...type.display, color: colors.bright },
  subtitle: { color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg, fontSize: 14 },
  search: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.line, marginBottom: spacing.lg
  },
  searchInput: { flex: 1, color: colors.bright, paddingVertical: 12, fontSize: 15 },
  bodyCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.line
  },
  selectedRow: { alignItems: "center", marginTop: spacing.md, minHeight: 30, justifyContent: "center" },
  selectedPill: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.xl
  },
  selectedText: { color: "#08080c", fontWeight: "800", fontSize: 13 },
  hint: { color: colors.textDim, fontSize: 12 },
  chips: { gap: spacing.sm, paddingVertical: spacing.lg },
  count: { color: colors.textMuted, fontWeight: "700", fontSize: 12, marginBottom: spacing.sm, letterSpacing: 0.5 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line
  },
  rowIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentDim,
    alignItems: "center", justifyContent: "center"
  },
  rowName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  rowMuscles: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  levelDot: { width: 8, height: 8, borderRadius: 4 }
});
