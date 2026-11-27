/**
 * SetStateTag.tsx + PostWorkoutSummary.tsx + MuscleHeatMap.tsx
 * ----------------------------------------------------------------------------
 * SetStateTag: botones de 1 toque para etiquetar el estado de cada serie.
 *   Tags: Limpia, Al límite, Molestia, Faltó energía.
 *
 * PostWorkoutSummary: tarjeta de resumen post-entreno con volumen total,
 *   tiempo, PRs, distribución por grupo muscular y fatiga VBT media.
 *
 * MuscleHeatMap: mapa de calor muscular 7 días con intensidad por color.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";
import { toLocalISO } from "@/modules/intelligence/dateUtils";

// ============================================================================
// SetStateTag
// ============================================================================
const TAGS = [
  { code: "clean", label: "Limpia", color: colors.ok, emoji: "✓" },
  { code: "limit", label: "Al límite", color: colors.bottom, emoji: "⚡" },
  { code: "soreness", label: "Molestia", color: colors.warning, emoji: "!" },
  { code: "low_energy", label: "Faltó energía", color: colors.error, emoji: "↓" }
] as const;

export const SetStateTag: React.FC<{ setId: string; currentTag?: string; onTagged?: (code: string) => void }> = ({ setId, currentTag, onTagged }) => {
  const [selected, setSelected] = useState<string | undefined>(currentTag);

  async function handleTag(code: string) {
    setSelected(code);
    const id = `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const db = await openDatabase();
    // Borrar tags previos del set
    await execAsync(db, "DELETE FROM set_state_tags WHERE set_id = ?", [setId]);
    await execAsync(
      db,
      "INSERT INTO set_state_tags (id, set_id, tag, note, created_at) VALUES (?, ?, ?, NULL, ?)",
      [id, setId, code, Date.now()]
    );
    onTagged?.(code);
  }

  return (
    <View style={styles.tagsRow}>
      {TAGS.map((t) => (
        <Pressable
          key={t.code}
          style={[
            styles.tagBtn,
            { borderColor: t.color },
            selected === t.code && { backgroundColor: t.color + "33" }
          ]}
          onPress={() => handleTag(t.code)}
        >
          <Text style={[styles.tagEmoji, { color: t.color }]}>{t.emoji}</Text>
          <Text style={[styles.tagLabel, { color: selected === t.code ? t.color : colors.textMuted }]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
};

// ============================================================================
// PostWorkoutSummary
// ============================================================================
interface SummaryData {
  durationSec: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  prsAchieved: number;
  avgFatigueVbt?: number;
  muscleDistribution: { muscle: string; volumeKg: number; pct: number }[];
  topSets: { exerciseId: string; weightKg: number; reps: number; est1rm: number }[];
}

export const PostWorkoutSummary: React.FC<{ workoutId: string; onClose: () => void }> = ({ workoutId, onClose }) => {
  const [summary, setSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDatabase();
      const sets = await queryAsync<any>(
        db,
        `SELECT s.*, e.primary_muscle, e.name as exercise_name
         FROM sets s LEFT JOIN exercises e ON e.id = s.exercise_id
         WHERE s.workout_id = ?`,
        [workoutId]
      );
      if (sets.length === 0) { setSummary(null); return; }
      const totalVolume = sets.reduce((s: number, r: any) => s + r.volume_kg, 0);
      const totalSets = sets.length;
      const totalReps = sets.reduce((s: number, r: any) => s + r.reps, 0);
      const workoutRow = await queryAsync<any>(db, "SELECT * FROM workouts WHERE id = ?", [workoutId]);
      const durationSec = workoutRow[0]?.duration_sec ?? 0;
      const prsAchieved = await queryAsync<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM personal_records WHERE set_id IN (SELECT id FROM sets WHERE workout_id = ?)", [workoutId]);

      // Distribución por músculo
      const byMuscle = new Map<string, number>();
      for (const s of sets) {
        const m = s.primary_muscle ?? "unknown";
        byMuscle.set(m, (byMuscle.get(m) ?? 0) + s.volume_kg);
      }
      const muscleDistribution = Array.from(byMuscle.entries())
        .map(([muscle, vol]) => ({ muscle, volumeKg: vol, pct: vol / totalVolume * 100 }))
        .sort((a, b) => b.volumeKg - a.volumeKg);

      // Top 3 sets por 1RM
      const topSets = sets
        .map((s: any) => ({ exerciseId: s.exercise_id, weightKg: s.weight_kg, reps: s.reps, est1rm: s.est_1rm_kg }))
        .sort((a: any, b: any) => b.est1rm - a.est1rm)
        .slice(0, 3);

      // Fatiga media VBT (extraída de pose_summary)
      const fatigueValues: number[] = [];
      for (const s of sets) {
        if (s.pose_summary) {
          try {
            const ps = JSON.parse(s.pose_summary);
            if (ps.vbt?.lossPct) fatigueValues.push(ps.vbt.lossPct);
          } catch {}
        }
      }
      const avgFatigueVbt = fatigueValues.length > 0
        ? fatigueValues.reduce((s, v) => s + v, 0) / fatigueValues.length
        : undefined;

      setSummary({
        durationSec,
        totalVolumeKg: totalVolume,
        totalSets,
        totalReps,
        prsAchieved: prsAchieved[0]?.cnt ?? 0,
        avgFatigueVbt,
        muscleDistribution,
        topSets
      });
    })();
  }, [workoutId]);

  if (!summary) return <View style={styles.emptyCard}><Text style={styles.emptyText}>Sin datos</Text></View>;

  return (
    <ScrollView style={styles.summaryCard}>
      <Text style={styles.title}>Resumen del entreno</Text>
      <View style={styles.statRow}>
        <Stat label="Duración" value={`${Math.floor(summary.durationSec / 60)} min`} />
        <Stat label="Volumen" value={`${Math.round(summary.totalVolumeKg)} kg`} />
        <Stat label="Series" value={`${summary.totalSets}`} />
      </View>
      <View style={styles.statRow}>
        <Stat label="Reps totales" value={`${summary.totalReps}`} />
        <Stat label="PRs nuevos" value={`${summary.prsAchieved}`} color={colors.ok} />
        {summary.avgFatigueVbt !== undefined && (
          <Stat label="Fatiga VBT" value={`${summary.avgFatigueVbt.toFixed(0)}%`} color={colors.warning} />
        )}
      </View>

      <Text style={styles.sectionTitle}>Distribución por músculo</Text>
      {summary.muscleDistribution.map((m) => (
        <View key={m.muscle} style={styles.muscleRow}>
          <Text style={styles.muscleName}>{m.muscle}</Text>
          <View style={styles.muscleBar}>
            <View style={[styles.muscleBarFill, { width: `${m.pct}%` }]} />
          </View>
          <Text style={styles.musclePct}>{Math.round(m.pct)}%</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Top 3 series por 1RM</Text>
      {summary.topSets.map((s, i) => (
        <View key={i} style={styles.topSetRow}>
          <Text style={styles.topSetRank}>#{i + 1}</Text>
          <Text style={styles.topSetLoad}>{s.weightKg}kg × {s.reps}</Text>
          <Text style={styles.topSet1rm}>{Math.round(s.est1rm)}kg 1RM</Text>
        </View>
      ))}

      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>Cerrar</Text>
      </Pressable>
    </ScrollView>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <View style={styles.statBox}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color: color ?? colors.bright }]}>{value}</Text>
  </View>
);

// ============================================================================
// MuscleHeatMap - 7 días
// ============================================================================
export const MuscleHeatMap: React.FC = () => {
  const [data, setData] = useState<{ muscle: string; days: number[] }[]>([]);

  useEffect(() => {
    (async () => {
      const db = await openDatabase();
      // Últimos 7 días
      const today = new Date();
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        days.push(toLocalISO(d));
      }
      // Para cada día, suma volumen por músculo
      const muscleMap = new Map<string, number[]>();
      for (const day of days) {
        const rows = await queryAsync<{ primary_muscle: string; vol: number }>(
          db,
          `SELECT e.primary_muscle, SUM(s.volume_kg) as vol
           FROM sets s JOIN exercises e ON e.id = s.exercise_id
           WHERE date(s.created_at/1000, 'unixepoch') = ? AND e.primary_muscle IS NOT NULL
           GROUP BY e.primary_muscle`,
          [day]
        );
        for (const r of rows) {
          if (!muscleMap.has(r.primary_muscle)) muscleMap.set(r.primary_muscle, [0, 0, 0, 0, 0, 0, 0]);
        }
        for (const r of rows) {
          const idx = days.indexOf(day);
          muscleMap.get(r.primary_muscle)![idx] = r.vol;
        }
      }
      setData(Array.from(muscleMap.entries()).map(([muscle, days]) => ({ muscle, days })));
    })();
  }, []);

  const maxVol = Math.max(...data.flatMap(d => d.days), 1);

  return (
    <View style={styles.heatCard}>
      <Text style={styles.title}>Mapa de calor muscular · 7 días</Text>
      {data.length === 0 && <Text style={styles.emptyText}>Sin datos de entrenos en los últimos 7 días</Text>}
      {data.map((row) => (
        <View key={row.muscle} style={styles.heatRow}>
          <Text style={styles.heatMuscle}>{row.muscle}</Text>
          <View style={styles.heatCells}>
            {row.days.map((vol, i) => {
              const intensity = vol / maxVol;
              const color = vol === 0 ? colors.dim : `rgba(255, 107, 53, ${0.3 + intensity * 0.7})`;
              return (
                <View key={i} style={[styles.heatCell, { backgroundColor: color }]}>
                  {vol > 0 && <Text style={styles.heatCellText}>{Math.round(vol)}</Text>}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.dayLabels}>
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
          <Text key={i} style={styles.dayLabel}>{d}</Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tagsRow: { flexDirection: "row", gap: spacing.xs, marginVertical: spacing.sm },
  tagBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, alignItems: "center", gap: 2 },
  tagEmoji: { fontSize: 14, fontWeight: "900" },
  tagLabel: { fontSize: 10, fontWeight: "700" },
  emptyCard: { padding: spacing.lg, backgroundColor: colors.bgCard, borderRadius: radius.md },
  emptyText: { color: colors.textMuted, textAlign: "center" },
  summaryCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.dim, maxHeight: 600 },
  title: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  statRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  sectionTitle: { color: colors.bright, fontSize: 13, fontWeight: "800", letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  muscleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  muscleName: { color: colors.text, fontSize: 12, width: 100, fontWeight: "600" },
  muscleBar: { flex: 1, height: 8, backgroundColor: colors.dim, borderRadius: 4, overflow: "hidden" },
  muscleBarFill: { height: "100%", backgroundColor: colors.accent },
  musclePct: { color: colors.bright, fontSize: 12, fontWeight: "700", width: 36, textAlign: "right" },
  topSetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  topSetRank: { color: colors.accent, fontWeight: "900", fontSize: 14, width: 30 },
  topSetLoad: { color: colors.bright, fontSize: 14, fontWeight: "700", flex: 1 },
  topSet1rm: { color: colors.ok, fontSize: 13, fontWeight: "800" },
  closeBtn: { backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  closeBtnText: { color: "#08080c", fontWeight: "800" },
  heatCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  heatRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  heatMuscle: { color: colors.text, fontSize: 12, width: 80, fontWeight: "600" },
  heatCells: { flex: 1, flexDirection: "row", gap: 4 },
  heatCell: { flex: 1, height: 28, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  heatCellText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  dayLabels: { flexDirection: "row", gap: 4, marginTop: spacing.xs, paddingLeft: 80 },
  dayLabel: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 10, fontWeight: "700" }
});
