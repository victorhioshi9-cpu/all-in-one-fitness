/**
 * RecommendationsScreen.tsx
 * ----------------------------------------------------------------------------
 * Pantalla de recomendaciones inteligentes.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  generateRecommendations, type Recommendation
} from "./recommendationEngine";
import { Linking } from "react-native";

export const RecommendationsScreen: React.FC = () => {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await generateRecommendations();
      setRecs(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Recomendaciones</Text>
      <Text style={styles.subtitle}>Cruzando readiness + planificación + fatiga + nutrición + cámara</Text>

      {loading && <Text style={styles.loading}>Calculando…</Text>}
      {!loading && recs.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>✓ Sin recomendaciones urgentes. ¡Vas genial!</Text>
        </View>
      )}

      {recs.map(r => (
        <View key={r.id} style={[styles.recCard, { borderLeftColor: sevColor(r.severity) }]}>
          <View style={styles.recHeader}>
            <Text style={[styles.recCategory, { color: catColor(r.category) }]}>{r.category.toUpperCase()}</Text>
            <Text style={[styles.recSev, { color: sevColor(r.severity) }]}>{sevLabel(r.severity)}</Text>
          </View>
          <Text style={styles.recTitle}>{r.title}</Text>
          <Text style={styles.recBody}>{r.body}</Text>
          {r.action && (
            <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(r.action!.deepLink)}>
              <Text style={styles.actionText}>{r.action.label} →</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

function sevColor(s: Recommendation["severity"]): string {
  return { info: colors.concentric, suggest: colors.warning, strong: colors.error }[s];
}
function sevLabel(s: Recommendation["severity"]): string {
  return { info: "INFO", suggest: "SUGERENCIA", strong: "URGENTE" }[s];
}
function catColor(c: Recommendation["category"]): string {
  return {
    training: colors.accent,
    nutrition: colors.ok,
    hydration: colors.concentric,
    recovery: colors.bottom,
    technique: colors.bright
  }[c];
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  loading: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  emptyCard: { backgroundColor: "rgba(34, 197, 94, 0.12)", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.ok },
  emptyText: { color: colors.ok, textAlign: "center", fontSize: 16, fontWeight: "700" },
  recCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dim, borderLeftWidth: 4 },
  recHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  recCategory: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  recSev: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  recTitle: { color: colors.bright, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  recBody: { color: colors.text, fontSize: 13, lineHeight: 19 },
  actionBtn: { marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: "rgba(255,107,53,0.15)", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  actionText: { color: colors.accent, fontWeight: "800", fontSize: 13 }
});
