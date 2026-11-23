/**
 * WorkoutsScreen.tsx
 * ----------------------------------------------------------------------------
 * Pantalla principal de Entrenos (Fase 3):
 *   - Historial de workouts con volumen/duración.
 *   - Botón "Nueva rutina" (editor simple).
 *   - Acceso a: PlateCalculator, HIITTimer, MuscleHeatMap, PostWorkoutSummary.
 *   - Doble progresión: al finalizar un entreno sugiere peso para próxima sesión.
 *   - Deload: si detecta fatiga acumulada, banner con sugerencia.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, FlatList, Modal, TextInput
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { PlateCalculator } from "./PlateCalculator";
import { HIITTimer, RestTimer } from "./HIITTimer";
import { MuscleHeatMap, PostWorkoutSummary, SetStateTag } from "./PostWorkoutSummary";
import { computeDoubleProgression, suggestDeload } from "./doubleProgression";

export const WorkoutsScreen: React.FC = () => {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showTool, setShowTool] = useState<"plate" | "hiit" | "rest" | "heatmap" | "summary" | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [deloadAlerts, setDeloadAlerts] = useState<{ exerciseId: string; reason: string; deloadWeight: number }[]>([]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const db = await openDatabase();
    const rows = await queryAsync<any>(
      db,
      `SELECT w.*, COUNT(s.id) as sets_count, COALESCE(SUM(s.volume_kg), 0) as total_volume
       FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
       GROUP BY w.id ORDER BY w.started_at DESC LIMIT 30`,
      []
    );
    setWorkouts(rows);

    // Doble progresión para los ejercicios más frecuentes
    const exercises = await queryAsync<{ id: string; name: string }>(
      db,
      `SELECT e.id, e.name FROM exercises e
       WHERE e.id IN (SELECT DISTINCT exercise_id FROM sets ORDER BY created_at DESC LIMIT 5)`,
      []
    );
    const sugg = [];
    for (const ex of exercises) {
      const s = await computeDoubleProgression({
        exerciseId: ex.id, minReps: 6, maxReps: 8, targetSets: 4, weightIncrementKg: 2.5
      });
      if (s) sugg.push({ ...s, name: ex.name });
      const dl = await suggestDeload(ex.id);
      if (dl.needed && dl.deloadWeight) {
        setDeloadAlerts(prev => [...prev.filter(a => a.exerciseId !== ex.id), { exerciseId: ex.id, reason: dl.reason!, deloadWeight: dl.deloadWeight! }]);
      }
    }
    setSuggestions(sugg);
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Entrenos</Text>

      {/* Deload alerts */}
      {deloadAlerts.length > 0 && (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠ Deload sugerido</Text>
          {deloadAlerts.map(a => (
            <Text key={a.exerciseId} style={styles.alertText}>
              {a.reason} → bajar a {a.deloadWeight} kg
            </Text>
          ))}
        </View>
      )}

      {/* Doble progresión: sugerencias para próxima sesión */}
      {suggestions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Próxima sesión sugerida</Text>
          {suggestions.map(s => (
            <View key={s.exerciseId} style={styles.suggRow}>
              <Text style={styles.suggName}>{s.name}</Text>
              <Text style={[
                styles.suggRec,
                { color: s.recommendation === "increase_weight" ? colors.ok : s.recommendation === "maintain" ? colors.warning : colors.concentric }
              ]}>
                {s.nextWeight}kg × {s.nextTargetReps} reps
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Tools */}
      <View style={styles.toolsRow}>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("plate")}>
          <Text style={styles.toolText}>Discos</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("hiit")}>
          <Text style={styles.toolText}>HIIT</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("rest")}>
          <Text style={styles.toolText}>Descanso</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("heatmap")}>
          <Text style={styles.toolText}>Heatmap</Text>
        </Pressable>
      </View>

      {/* Historial */}
      <Text style={styles.cardTitle}>Historial</Text>
      {workouts.length === 0 && (
        <View style={{ backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 40, marginBottom: spacing.md }}>🏋️</Text>
          <Text style={{ color: colors.bright, fontSize: 18, fontWeight: "800", marginBottom: spacing.xs }}>Sin entrenos aún</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
            Ve a la pestaña Coach para iniciar tu primera sesión con seguimiento de postura, o usa el cronómetro HIIT aquí abajo.
          </Text>
        </View>
      )}
      <FlatList
        data={workouts}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.workoutCard}
            onPress={() => { setSelectedWorkoutId(item.id); setShowTool("summary"); }}
          >
            <View style={styles.workoutHeader}>
              <Text style={styles.workoutName}>{item.name}</Text>
              <Text style={styles.workoutDate}>
                {new Date(item.started_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.workoutStats}>
              <Text style={styles.workoutStat}>{Math.round(item.total_volume)} kg</Text>
              <Text style={styles.workoutStat}>{item.sets_count} series</Text>
              {item.duration_sec && (
                <Text style={styles.workoutStat}>{Math.floor(item.duration_sec / 60)} min</Text>
              )}
            </View>
            {item.status === "in_progress" && (
              <Text style={styles.inProgress}>EN CURSO</Text>
            )}
          </Pressable>
        )}
      />

      {/* Tool modals */}
      <Modal visible={showTool !== null} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showTool === "plate" && "Calculadora de discos"}
              {showTool === "hiit" && "Modo HIIT"}
              {showTool === "rest" && "Cronómetro de descanso"}
              {showTool === "heatmap" && "Mapa de calor muscular"}
              {showTool === "summary" && "Resumen de entreno"}
            </Text>
            <Pressable onPress={() => setShowTool(null)}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView>
            {showTool === "plate" && <PlateCalculator />}
            {showTool === "hiit" && <HIITTimer />}
            {showTool === "rest" && <RestTimer suggestedSec={90} />}
            {showTool === "heatmap" && <MuscleHeatMap />}
            {showTool === "summary" && selectedWorkoutId && (
              <PostWorkoutSummary workoutId={selectedWorkoutId} onClose={() => setShowTool(null)} />
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800", marginBottom: spacing.lg },
  alertCard: { backgroundColor: "rgba(245, 158, 11, 0.12)", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.warning },
  alertTitle: { color: colors.warning, fontWeight: "800", fontSize: 14, marginBottom: 4 },
  alertText: { color: colors.bright, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md },
  suggRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  suggName: { color: colors.text, fontSize: 14 },
  suggRec: { fontSize: 14, fontWeight: "800" },
  toolsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  toolBtn: { flex: 1, backgroundColor: colors.bgCard, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.dim },
  toolText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  empty: { color: colors.textMuted, fontStyle: "italic", marginTop: spacing.sm },
  workoutCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  workoutHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  workoutName: { color: colors.bright, fontSize: 16, fontWeight: "700" },
  workoutDate: { color: colors.textMuted, fontSize: 12 },
  workoutStats: { flexDirection: "row", gap: spacing.md },
  workoutStat: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  inProgress: { color: colors.ok, fontSize: 11, fontWeight: "800", marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { color: colors.bright, fontSize: 20, fontWeight: "800" },
  closeText: { color: colors.accent, fontWeight: "700" }
});
