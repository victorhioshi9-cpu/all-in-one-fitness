/**
 * MuscleRecoveryCard.tsx - Mapa corporal de recuperación muscular.
 * Colorea cada músculo según las horas desde que lo entrenaste (últimos 7 días):
 *   rojo < 24 h · naranja 24-48 h · lima 48-72 h · verde > 72 h · gris = sin datos.
 * Sustituye visualmente a la tabla del MuscleHeatMap (que sigue existiendo).
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, type } from "@/theme/colors";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { BodyMap } from "./BodyMap";
import { parseMuscleText, MUSCLE_LABEL, type MuscleId } from "./muscles";
import { Card } from "@/components/ui";

const HOUR = 3600 * 1000;

export const RECOVERY_COLORS = {
  fatigued: "#ef4444",
  recovering: "#f59e0b",
  almost: "#a3e635",
  ready: "#22c55e"
} as const;

export function recoveryColor(hoursSince: number): string {
  if (hoursSince < 24) return RECOVERY_COLORS.fatigued;
  if (hoursSince < 48) return RECOVERY_COLORS.recovering;
  if (hoursSince < 72) return RECOVERY_COLORS.almost;
  return RECOVERY_COLORS.ready;
}

export interface MuscleRecovery {
  colorMap: Partial<Record<MuscleId, string>>;
  hours: Partial<Record<MuscleId, number>>;
  loading: boolean;
  reload: () => void;
}

export function useMuscleRecovery(): MuscleRecovery {
  const [hours, setHours] = useState<Partial<Record<MuscleId, number>>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const db = await openDatabase();
      const since = Date.now() - 7 * 24 * HOUR;
      const rows = await queryAsync<{ muscle: string; last_at: number }>(
        db,
        `SELECT e.primary_muscle as muscle, MAX(s.created_at) as last_at
         FROM sets s JOIN exercises e ON e.id = s.exercise_id
         WHERE s.created_at >= ? AND e.primary_muscle IS NOT NULL
         GROUP BY e.primary_muscle`,
        [since]
      );
      const h: Partial<Record<MuscleId, number>> = {};
      const now = Date.now();
      for (const r of rows) {
        const hrs = Math.max(0, (now - r.last_at) / HOUR);
        for (const m of parseMuscleText(r.muscle).muscles) {
          h[m] = h[m] === undefined ? hrs : Math.min(h[m]!, hrs);
        }
      }
      setHours(h);
    } catch (err) {
      console.warn("[MuscleRecovery] falló:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const colorMap: Partial<Record<MuscleId, string>> = {};
  (Object.keys(hours) as MuscleId[]).forEach((m) => { colorMap[m] = recoveryColor(hours[m]!); });
  return { colorMap, hours, loading, reload: load };
}

export const MuscleRecoveryCard: React.FC<{ bodyWidth?: number; title?: string }> = ({
  bodyWidth = 140, title = "Recuperación muscular"
}) => {
  const { colorMap, hours, loading } = useMuscleRecovery();
  const trained = (Object.keys(hours) as MuscleId[]).sort((a, b) => hours[a]! - hours[b]!);

  return (
    <Card elevated>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.bodies}>
        <BodyMap view="front" width={bodyWidth} colorMap={colorMap} />
        <BodyMap view="back" width={bodyWidth} colorMap={colorMap} />
      </View>

      <View style={styles.legend}>
        {[
          ["Fatigado", RECOVERY_COLORS.fatigued],
          ["24-48 h", RECOVERY_COLORS.recovering],
          ["48-72 h", RECOVERY_COLORS.almost],
          ["Listo", RECOVERY_COLORS.ready]
        ].map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {!loading && trained.length === 0 && (
        <Text style={styles.empty}>Sin entrenos en 7 días: todo tu cuerpo está listo.</Text>
      )}
      {trained.slice(0, 4).map((m) => (
        <View key={m} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colorMap[m] }]} />
          <Text style={styles.rowName}>{MUSCLE_LABEL[m]}</Text>
          <Text style={styles.rowVal}>hace {Math.round(hours[m]!)} h</Text>
        </View>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.bright },
  bodies: { flexDirection: "row", justifyContent: "space-around", marginTop: spacing.md },
  legend: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.md, fontSize: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6
  },
  rowName: { color: colors.text, fontWeight: "700", flex: 1 },
  rowVal: { color: colors.textMuted, fontSize: 12 }
});
