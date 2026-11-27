/**
 * ReadinessScreen.tsx
 * ----------------------------------------------------------------------------
 * Dashboard de Inteligencia Cruzada:
 *   - Score de Readiness (gauge grande, color por nivel)
 *   - Factores desglosados (sueño, FC reposo, fatiga muscular)
 *   - Recomendación textual del día
 *   - Balance energético de hoy y semana (kcal in vs out)
 *   - Línea de tendencia de peso (suavizada + outliers marcados)
 *   - Alertas de composición corporal
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  computeReadiness,
  type ReadinessResult
} from "@/modules/intelligence/readiness";
import {
  computeDayEnergyBalance,
  computeWeeklyEnergyBalance,
  type EnergyBalanceDay,
  type EnergyBalanceWeek
} from "@/modules/intelligence/energyBalance";
import {
  computeWeightTrend,
  type WeightTrend
} from "@/modules/intelligence/weightTrend";
import {
  detectBodyCompAlerts,
  type BodyCompAlert
} from "@/modules/intelligence/bodyCompAlerts";
import { toLocalISO } from "@/modules/intelligence/dateUtils";

export const ReadinessScreen: React.FC = () => {
  const [ready, setReady] = useState<ReadinessResult | null>(null);
  const [todayBal, setTodayBal] = useState<EnergyBalanceDay | null>(null);
  const [weekBal, setWeekBal] = useState<EnergyBalanceWeek | null>(null);
  const [trend, setTrend] = useState<WeightTrend | null>(null);
  const [alerts, setAlerts] = useState<BodyCompAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t, w, tr, al] = await Promise.all([
        computeReadiness(),
        computeDayEnergyBalance(toLocalISO(new Date())),
        computeWeeklyEnergyBalance(),
        computeWeightTrend(),
        detectBodyCompAlerts()
      ]);
      setReady(r);
      setTodayBal(t);
      setWeekBal(w);
      setTrend(tr);
      setAlerts(al);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Calculando readiness…</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md }}>Sin datos todavía</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 20 }}>
          Para calcular tu readiness necesitas:{"\n\n"}• Datos de sueño de Health Connect{"\n"}• Frecuencia cardíaca en reposo{"\n"}• Al menos 1 entreno registrado{"\n\n"}Concede permisos en la pestaña Salud y registra tu primer entreno en la pestaña Entrenos.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
    >
      {/* --- Readiness Gauge --- */}
      {ready && (
        <View style={styles.gaugeCard}>
          <Text style={styles.gaugeLabel}>READINESS · {ready.day}</Text>
          <Text style={[styles.gaugeValue, { color: scoreColor(ready.totalScore) }]}>
            {ready.totalScore}
          </Text>
          <Text style={[styles.gaugeLevel, { color: scoreColor(ready.totalScore) }]}>
            {levelLabel(ready.level)}
          </Text>
          <Text style={styles.recommendation}>{ready.recommendation}</Text>
          <View style={styles.factorsRow}>
            {ready.factors.map((f) => (
              <View key={f.key} style={styles.factorCard}>
                <Text style={styles.factorLabel}>{f.label}</Text>
                <Text style={[styles.factorScore, { color: scoreColor(f.score) }]}>
                  {Math.round(f.score)}
                </Text>
                <Text style={styles.factorValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* --- Energy Balance --- */}
      {todayBal && (
        <Section title="Energía hoy">
          <BalRow label="Ingerido" value={`${Math.round(todayBal.kcalIn)} kcal`} color={colors.concentric} />
          <BalRow label="Activo (reloj)" value={`${Math.round(todayBal.kcalOutActive)} kcal`} color={colors.eccentric} />
          <BalRow label="Basal" value={`${Math.round(todayBal.kcalOutBasal)} kcal`} color={colors.textMuted} />
          <BalRow label="Total gastado" value={`${Math.round(todayBal.kcalOutTotal)} kcal`} color={colors.bright} />
          <View style={styles.divider} />
          <BalRow
            label={todayBal.balance >= 0 ? "Superávit" : "Déficit"}
            value={`${Math.abs(Math.round(todayBal.balance))} kcal`}
            color={todayBal.balance >= 0 ? colors.bottom : colors.ok}
            big
          />
        </Section>
      )}

      {/* --- Weekly Energy --- */}
      {weekBal && (
        <Section title="Últimos 7 días">
          <BalRow label="Total ingerido" value={`${Math.round(weekBal.totalKcalIn)} kcal`} />
          <BalRow label="Total gastado" value={`${Math.round(weekBal.totalKcalOut)} kcal`} />
          <BalRow
            label="Balance semanal"
            value={`${Math.round(weekBal.totalBalance)} kcal`}
            color={weekBal.totalBalance <= 0 ? colors.ok : colors.bottom}
            big
          />
          <Text style={styles.projection}>
            Proyección: {weekBal.projectedFatDeltaKg >= 0 ? "+" : ""}
            {weekBal.projectedFatDeltaKg.toFixed(2)} kg de grasa/semana
          </Text>
        </Section>
      )}

      {/* --- Weight Trend --- */}
      {trend && trend.points.length > 0 && (
        <Section title="Tendencia de peso">
          <BalRow label="Suavizado hoy" value={`${trend.smoothedTodayKg.toFixed(2)} kg`} big />
          <BalRow
            label="Delta vs ayer"
            value={`${trend.deltaKg >= 0 ? "+" : ""}${trend.deltaKg.toFixed(2)} kg`}
            color={trend.deltaKg <= 0 ? colors.ok : colors.bottom}
          />
          <BalRow
            label="Tendencia semanal"
            value={`${trend.weeklyTrendKg >= 0 ? "+" : ""}${trend.weeklyTrendKg.toFixed(2)} kg/sem`}
            color={trend.weeklyTrendKg <= 0 ? colors.ok : colors.bottom}
          />
          <BalRow label="Proyección 4 semanas" value={`${trend.projection4wKg.toFixed(2)} kg`} />
          <BalRow
            label="Estabilidad"
            value={trend.isStable ? "Estable ✓" : "Fluctuante"}
            color={trend.isStable ? colors.ok : colors.warning}
          />
          {trend.points.filter((p) => p.isOutlier).length > 0 && (
            <Text style={styles.outlierNote}>
              ⚠ {trend.points.filter((p) => p.isOutlier).length} mediciones marcadas como retención de líquidos y excluidas de la tendencia.
            </Text>
          )}
        </Section>
      )}

      {/* --- BodyComp Alerts --- */}
      {alerts.length > 0 && (
        <Section title="Alertas de composición">
          {alerts.map((a, i) => (
            <View key={i} style={[styles.alertCard, { borderLeftColor: alertColor(a.severity) }]}>
              <Text style={styles.alertTitle}>{a.title}</Text>
              <Text style={styles.alertMessage}>{a.message}</Text>
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
};

// --- Subcomponentes --------------------------------------------------------
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const BalRow: React.FC<{ label: string; value: string; color?: string; big?: boolean }> = ({
  label, value, color, big
}) => (
  <View style={[styles.row, big && styles.rowBig]}>
    <Text style={[styles.label, big && styles.labelBig]}>{label}</Text>
    <Text style={[styles.value, { color: color ?? colors.bright }, big && styles.valueBig]}>
      {value}
    </Text>
  </View>
);

// --- Helpers visuales ------------------------------------------------------
function scoreColor(score: number): string {
  if (score >= 85) return colors.ok;
  if (score >= 70) return colors.concentric;
  if (score >= 50) return colors.bottom;
  return colors.error;
}

function levelLabel(level: ReadinessResult["level"]): string {
  return { optimal: "ÓPTIMO", good: "BUENO", moderate: "MODERADO", low: "BAJO" }[level];
}

function alertColor(sev: BodyCompAlert["severity"]): string {
  return { info: colors.concentric, warning: colors.warning, critical: colors.error }[sev];
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.textMuted, fontSize: 16 },
  gaugeCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.dim
  },
  gaugeLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  gaugeValue: { fontSize: 88, fontWeight: "900", lineHeight: 100 },
  gaugeLevel: { fontSize: 18, fontWeight: "800", letterSpacing: 2, marginTop: -4 },
  recommendation: {
    color: colors.bright,
    fontSize: 15,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 21
  },
  factorsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: "100%"
  },
  factorCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center"
  },
  factorLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  factorScore: { fontSize: 26, fontWeight: "800", marginTop: 4 },
  factorValue: { color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: "center", lineHeight: 14 },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.dim
  },
  sectionTitle: {
    color: colors.bright,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: spacing.md,
    letterSpacing: 1
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: spacing.xs
  },
  rowBig: { paddingVertical: spacing.sm },
  label: { color: colors.textMuted, fontSize: 14 },
  labelBig: { fontSize: 16, color: colors.text },
  value: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  valueBig: { fontSize: 22, fontWeight: "800" },
  divider: {
    height: 1,
    backgroundColor: colors.dim,
    marginVertical: spacing.sm
  },
  projection: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    fontStyle: "italic"
  },
  outlierNote: {
    color: colors.warning,
    fontSize: 12,
    marginTop: spacing.md,
    lineHeight: 17
  },
  alertCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3
  },
  alertTitle: { color: colors.bright, fontSize: 14, fontWeight: "700" },
  alertMessage: { color: colors.text, fontSize: 13, marginTop: 4, lineHeight: 18 }
});
