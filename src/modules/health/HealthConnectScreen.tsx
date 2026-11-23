/**
 * HealthConnectScreen.tsx
 * ----------------------------------------------------------------------------
 * Pantalla de gestión de Health Connect:
 *   - Estado de instalación (instalado / no instalado / Android 14+ preinstalado).
 *   - Botón directo a Play Store si falta.
 *   - Estado de permisos (granted / partial / denied / not_requested).
 *   - Botón "Conceder permisos" → dispara requestAllPermissions().
 *   - Botón "Abrir ajustes Health Connect" para gestionar permisos revocados.
 *   - Botón "Sincronizar ahora" → pull de datos HC + push de workouts a HC.
 *   - Estado del sync worker (running / last run pushed/failed).
 *   - Pendientes de subir a la nube (count de sync_queue).
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, RefreshControl
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  checkAvailability,
  requestAllPermissions,
  getCurrentPermissionState,
  openHealthConnectInPlayStore,
  openHealthConnectApp
} from "@/modules/health/healthConnectClient";
import type { Availability, PermissionState } from "@/modules/health/types";

import { readStepsForDay } from "@/modules/health/readers/stepsReader";
import { readRestingHeartRate } from "@/modules/health/readers/heartRateReader";
import { readCaloriesForDay } from "@/modules/health/readers/caloriesReader";
import { readSleepForDay } from "@/modules/health/readers/sleepReader";
import { readBodyCompositionForDay } from "@/modules/health/readers/bodyCompositionReader";
import { readStressForDay } from "@/modules/health/readers/stressReader";
import { pushLastWorkoutToHealthConnect } from "@/modules/health/writers/workoutWriter";

import { forceDrainNow, isSyncRunning, getLastRunResult } from "@/modules/sync/syncWorker";
import { countPending } from "@/modules/cloud/syncService";
import { todayISO } from "@/modules/intelligence/dateUtils";

export const HealthConnectScreen: React.FC = () => {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [permState, setPermState] = useState<PermissionState>("not_requested");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [workerRunning, setWorkerRunning] = useState<boolean>(false);
  const [lastRun, setLastRun] = useState<{ pushed: number; failed: number; ts: number } | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [todayMetrics, setTodayMetrics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [avail, perm, pending, running, last] = await Promise.all([
      checkAvailability(),
      getCurrentPermissionState(),
      countPending(),
      isSyncRunning(),
      getLastRunResult()
    ]);
    setAvailability(avail);
    setPermState(perm);
    setPendingCount(pending);
    setWorkerRunning(running);
    setLastRun(last);
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadTodayMetrics = useCallback(async () => {
    const today = todayISO();
    const [steps, rhr, cal, sleep, body, stress] = await Promise.all([
      readStepsForDay(today).catch(() => null),
      readRestingHeartRate(today).catch(() => null),
      readCaloriesForDay(today).catch(() => null),
      readSleepForDay(today).catch(() => null),
      readBodyCompositionForDay(today).catch(() => null),
      readStressForDay(today).catch(() => null)
    ]);
    setTodayMetrics({ steps, rhr, cal, sleep, body, stress });
  }, []);

  useEffect(() => {
    if (permState === "granted" || permState === "partial") {
      loadTodayMetrics();
    }
  }, [permState, loadTodayMetrics]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Salud & Wearables</Text>
      <Text style={styles.subtitle}>Integración con Google Health Connect</Text>

      {/* --- Availability --- */}
      <Section title="Health Connect">
        <Row label="Estado">
          <Badge
            color={availability === "installed" ? colors.ok : colors.warning}
            text={availability === "installed" ? "Instalado" : "No detectado"}
          />
        </Row>
        {availability !== "installed" && (
          <>
            <Text style={styles.hint}>
              Si ya tienes Health Connect instalado y sigue saliendo "No detectado", es probable que el módulo nativo necesite reinstalarse tras un rebuild. Toca abajo para abrir Play Store y verificar:
            </Text>
            <Pressable style={styles.btnPrimary} onPress={openHealthConnectInPlayStore}>
              <Text style={styles.btnPrimaryText}>Abrir Health Connect en Play Store</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.btnSecondary} onPress={openHealthConnectApp}>
          <Text style={styles.btnSecondaryText}>Abrir ajustes de Health Connect</Text>
        </Pressable>
      </Section>

      {/* --- Permissions --- */}
      <Section title="Permisos">
        <Row label="Estado permisos">
          <Badge
            color={permState === "granted" ? colors.ok : permState === "partial" ? colors.warning : colors.error}
            text={
              permState === "granted" ? "Concedidos" :
              permState === "partial" ? "Parciales" :
              permState === "denied" ? "Denegados" : "Sin solicitar"
            }
          />
        </Row>
        <Pressable style={styles.btnPrimary} onPress={async () => {
          const r = await requestAllPermissions();
          setPermState(r);
        }}>
          <Text style={styles.btnPrimaryText}>Conceder permisos</Text>
        </Pressable>
      </Section>

      {/* --- Today metrics from Mi Fitness --- */}
      {todayMetrics && (
        <Section title="Datos de hoy (Mi Fitness vía Health Connect)">
          <MetricRow label="Pasos" value={todayMetrics.steps ? `${todayMetrics.steps.value.toLocaleString()}` : "—"} />
          <MetricRow label="FC Reposo" value={todayMetrics.rhr != null ? `${todayMetrics.rhr} bpm` : "—"} />
          <MetricRow label="Calorías activas" value={todayMetrics.cal ? `${Math.round(todayMetrics.cal.activeKcal)} kcal` : "—"} />
          <MetricRow label="Calorías basales" value={todayMetrics.cal ? `${Math.round(todayMetrics.cal.basalKcal)} kcal` : "—"} />
          <MetricRow label="Sueño (asleep)" value={todayMetrics.sleep ? `${(todayMetrics.sleep.asleepMs / 3600000).toFixed(1)}h` : "—"} />
          <MetricRow label="Peso" value={todayMetrics.body?.weightKg ? `${todayMetrics.body.weightKg.toFixed(1)} kg` : "—"} />
          <MetricRow label="% Grasa" value={todayMetrics.body?.bodyFatPct != null ? `${todayMetrics.body.bodyFatPct.toFixed(1)}%` : "—"} />
          <MetricRow label="Estrés" value={todayMetrics.stress ? `${todayMetrics.stress.stressIndex} (${todayMetrics.stress.method})` : "—"} />
        </Section>
      )}

      {/* --- Cloud sync --- */}
      <Section title="Sincronización cloud (Supabase)">
        <Row label="Worker">
          <Badge color={workerRunning ? colors.ok : colors.dim} text={workerRunning ? "Corriendo" : "Detenido"} />
        </Row>
        <Row label="Pendientes">
          <Text style={styles.value}>{pendingCount} registros</Text>
        </Row>
        {lastRun && (
          <Row label="Última corrida">
            <Text style={styles.valueMuted}>
              {lastRun.pushed} subidos · {lastRun.failed} fallidos · {new Date(lastRun.ts).toLocaleTimeString()}
            </Text>
          </Row>
        )}
        <Pressable
          style={[styles.btnPrimary, syncingNow && styles.btnDisabled]}
          disabled={syncingNow}
          onPress={async () => {
            setSyncingNow(true);
            await forceDrainNow();
            await refresh();
            setSyncingNow(false);
          }}
        >
          {syncingNow
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.btnPrimaryText}>Sincronizar ahora</Text>}
        </Pressable>
      </Section>

      {/* --- Push workout to HC --- */}
      <Section title="Subir entrenos a Health Connect">
        <Text style={styles.hint}>
          Publica tu última sesión completada como ExerciseSessionRecord en Health Connect
          para que Google Fit, Samsung Health y Mi Fitness la reconozcan.
        </Text>
        <Pressable
          style={styles.btnSecondary}
          onPress={pushLastWorkoutToHealthConnect}
        >
          <Text style={styles.btnSecondaryText}>Publicar último entreno</Text>
        </Pressable>
      </Section>
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

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const Badge: React.FC<{ color: string; text: string }> = ({ color, text }) => (
  <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
    <Text style={[styles.badgeText, { color }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.xl },
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
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.md,
    letterSpacing: 0.5
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm
  },
  label: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.bright, fontSize: 16, fontWeight: "700" },
  valueMuted: { color: colors.textMuted, fontSize: 13 },
  badge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1
  },
  badgeText: { fontSize: 12, fontWeight: "800" },
  btnPrimary: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
    minHeight: 48,
    justifyContent: "center"
  },
  btnPrimaryText: { color: "#08080c", fontWeight: "800", fontSize: 15 },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dim
  },
  btnSecondaryText: { color: colors.bright, fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm, lineHeight: 19 }
});
