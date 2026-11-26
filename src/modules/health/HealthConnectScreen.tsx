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
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, RefreshControl, AppState
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  checkAvailability,
  requestAllPermissions,
  getCurrentPermissionState,
  openHealthConnectInPlayStore,
  openHealthConnectApp,
  isNativeModuleLoaded,
  invalidateAvailabilityCache
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
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionInfo, setPermissionInfo] = useState<string | null>(null);
  const nativeLoaded = isNativeModuleLoaded();
  const [requestingPerm, setRequestingPerm] = useState(false);

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

    // Si tenemos permisos, cargar métricas inmediatamente.
    if (perm === "granted" || perm === "partial") {
      loadTodayMetrics();
    }
  }, [loadTodayMetrics]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (permState === "granted" || permState === "partial") {
      loadTodayMetrics();
    }
  }, [permState, loadTodayMetrics]);

  // --- AppState listener: refrescar automáticamente al volver de HC ---
  // Cuando el usuario pulsa 'Conceder permisos', abrimos los ajustes de HC.
  // El usuario concede los permisos ahí y vuelve a la app. Sin este listener,
  // el estado 'Sin solicitar' persiste hasta que el usuario pulsa 'Recomprobar
  // ahora' manualmente. Con este listener, al volver a la app (AppState = active),
  // refrescamos automáticamente y el cartel rojo desaparece solo.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;
      // Si la app pasa de background/inactive a active → refrescar.
      if (prev.match(/inactive|background/) && nextAppState === "active") {
        console.log("[HealthConnectScreen] app volvió a active, refrescando permisos...");
        // Invalidar caché de availability por si el usuario instaló HC.
        invalidateAvailabilityCache();
        refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);

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
        {!nativeLoaded && (
          <>
            <Text style={styles.hint}>
              ⚠️ El módulo nativo de react-native-health-connect NO está cargado.
              Esto significa que el config plugin no se aplicó correctamente.
              Tienes que hacer un rebuild limpio:
            </Text>
            <Text style={[styles.hint, { fontFamily: 'monospace' }]}>
              npx expo prebuild --platform android --clean{'\n'}eas build --profile preview --platform android
            </Text>
          </>
        )}
        <Row label="Estado">
          <Badge
            color={availability === "installed" ? colors.ok : colors.warning}
            text={availability === "installed" ? "Instalado" : "No detectado"}
          />
        </Row>
        {availability !== "installed" && (
          <>
            <Text style={styles.hint}>
              Si ya tienes Health Connect instalado y sigue saliendo "No detectado", puede deberse a:{'\n'}
              • Android 13- sin HC instalado (instálalo desde Play Store abajo).{'\n'}
              • Falta el &lt;queries&gt; en AndroidManifest (ya arreglado en el config plugin).{'\n'}
              • Build sin aplicar el plugin → ejecuta `expo prebuild --clean`.
            </Text>
            <Pressable style={styles.btnPrimary} onPress={async () => {
              await openHealthConnectInPlayStore();
              // Tras volver de Play Store, invalida caché para re-checkear.
              setTimeout(async () => {
                invalidateAvailabilityCache();
                await refresh();
              }, 5000);
            }}>
              <Text style={styles.btnPrimaryText}>Abrir Health Connect en Play Store</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={async () => {
              invalidateAvailabilityCache();
              setAvailability("checking");
              await refresh();
            }}>
              <Text style={styles.btnSecondaryText}>Recomprobar ahora</Text>
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
        {permissionError && (
          <Text style={[styles.hint, { color: colors.error }]}>
            ⚠️ {permissionError}
          </Text>
        )}
        {permissionInfo && (
          <Text style={[styles.hint, { color: colors.ok }]}>
            ✓ {permissionInfo}
          </Text>
        )}
        <Pressable
          style={[styles.btnPrimary, requestingPerm && styles.btnDisabled]}
          disabled={requestingPerm}
          onPress={async () => {
            setRequestingPerm(true);
            setPermissionError(null);
            setPermissionInfo(null);
            try {
              const r = await requestAllPermissions();
              setPermState(r);
              if (r === "granted") {
                setPermissionInfo("Permisos concedidos. Ya puedes sincronizar datos.");
              } else if (r === "partial") {
                setPermissionInfo("Permisos parciales. Algunos datos no estarán disponibles.");
              } else if (r === "not_requested") {
                // Esto ahora significa: abrimos los ajustes de HC para que el
                // usuario conceda manualmente. NO es un error.
                setPermissionInfo(
                  "Se abrieron los ajustes de Health Connect. " +
                  "Busca 'All-in-One Fitness' en la lista de apps, " +
                  "concede los permisos, vuelve a esta pantalla y pulsa 'Recomprobar ahora'."
                );
              } else if (r === "denied") {
                setPermissionError(
                  "Permisos denegados. Vuelve a pulsar 'Conceder permisos' para abrir los ajustes de Health Connect."
                );
              }
            } catch (err: any) {
              setPermissionError(`Error inesperado: ${err?.message ?? String(err)}`);
            } finally {
              setRequestingPerm(false);
            }
          }}
        >
          {requestingPerm
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.btnPrimaryText}>Conceder permisos</Text>}
        </Pressable>
      </Section>

      {/* --- Dashboard de métricas del smartwatch + báscula --- */}
      {todayMetrics && (
        <Section title="📊 Datos de hoy (Mi Fitness + Báscula S400)">
          {/* Grid de tarjetas 2x4 */}
          <View style={styles.metricsGrid}>
            {/* Pasos */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>👟</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.steps ? todayMetrics.steps.value.toLocaleString() : "—"}
              </Text>
              <Text style={styles.metricLabel}>Pasos</Text>
            </View>

            {/* FC Reposo */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>❤️</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.rhr != null ? `${todayMetrics.rhr}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>FC Reposo (bpm)</Text>
            </View>

            {/* Calorías activas */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>🔥</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.cal ? `${Math.round(todayMetrics.cal.activeKcal)}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Kcal Activas</Text>
            </View>

            {/* Calorías basales */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>💤</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.cal ? `${Math.round(todayMetrics.cal.basalKcal)}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Kcal Basal</Text>
            </View>

            {/* Sueño */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>😴</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.sleep ? `${(todayMetrics.sleep.asleepMs / 3600000).toFixed(1)}h` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Sueño</Text>
            </View>

            {/* Estrés */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>😰</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.stress ? `${todayMetrics.stress.stressIndex}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Estrés</Text>
            </View>

            {/* Peso (báscula S400) */}
            <View style={[styles.metricCard, { borderColor: colors.accent }]}>
              <Text style={styles.metricEmoji}>⚖️</Text>
              <Text style={[styles.metricValue, { color: colors.accent }]}>
                {todayMetrics.body?.weightKg ? `${todayMetrics.body.weightKg.toFixed(1)}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Peso (kg)</Text>
            </View>

            {/* % Grasa (báscula S400) */}
            <View style={[styles.metricCard, { borderColor: colors.accent }]}>
              <Text style={styles.metricEmoji}>📏</Text>
              <Text style={[styles.metricValue, { color: colors.accent }]}>
                {todayMetrics.body?.bodyFatPct != null ? `${todayMetrics.body.bodyFatPct.toFixed(1)}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>% Grasa</Text>
            </View>
          </View>

          {/* Resumen inteligente */}
          {todayMetrics.body?.weightKg && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>🧠 Análisis inteligente</Text>
              {(() => {
                const weight = todayMetrics.body.weightKg;
                const bf = todayMetrics.body.bodyFatPct;
                const steps = todayMetrics.steps?.value ?? 0;
                const kcal = todayMetrics.cal?.activeKcal ?? 0;
                const tips: string[] = [];

                if (steps > 0) tips.push(`✅ ${steps.toLocaleString()} pasos hoy — ${steps >= 10000 ? "¡Objetivo cumplido!" : `faltan ${(10000 - steps).toLocaleString()} para 10k`}`);
                if (kcal > 0) tips.push(`🔥 ${Math.round(kcal)} kcal activas quemadas`);
                if (weight > 0) tips.push(`⚖️ Peso: ${weight.toFixed(1)} kg`);
                if (bf != null) {
                  const leanMass = weight * (1 - bf / 100);
                  const fatMass = weight * (bf / 100);
                  tips.push(`📊 Masa magra: ${leanMass.toFixed(1)} kg · Masa grasa: ${fatMass.toFixed(1)} kg`);
                  if (bf > 25) tips.push(`⚠️ % grasa elevado (${bf.toFixed(1)}%). Considera déficit calórico.`);
                  else if (bf < 12) tips.push(`✅ % grasa bajo (${bf.toFixed(1)}%). Excelente definición.`);
                  else tips.push(`✅ % grasa en rango saludable (${bf.toFixed(1)}%)`);
                }
                if (todayMetrics.rhr != null) {
                  if (todayMetrics.rhr > 80) tips.push(`⚠️ FC reposo alta (${todayMetrics.rhr} bpm). Posible fatiga o estrés.`);
                  else if (todayMetrics.rhr < 60) tips.push(`✅ FC reposo baja (${todayMetrics.rhr} bpm). Buen estado cardiovascular.`);
                  else tips.push(`✅ FC reposo normal (${todayMetrics.rhr} bpm)`);
                }
                if (todayMetrics.sleep) {
                  const sleepH = todayMetrics.sleep.asleepMs / 3600000;
                  if (sleepH < 6) tips.push(`⚠️ Solo ${sleepH.toFixed(1)}h de sueño. Necesitas dormir más.`);
                  else if (sleepH >= 7) tips.push(`✅ ${sleepH.toFixed(1)}h de sueño. Buena recuperación.`);
                }
                if (tips.length === 0) tips.push("⏳ Esperando datos del smartwatch y la báscula...");

                return tips.map((t, i) => (
                  <Text key={i} style={styles.summaryTip}>{t}</Text>
                ));
              })()}
            </View>
          )}

          {/* Indicador de fuente de datos */}
          <Text style={styles.dataSourceHint}>
            📡 Datos vía: Mi Fitness (smartwatch + báscula S400) → Health Connect → esta app
          </Text>

          {/* Botón refrescar datos */}
          <Pressable
            style={[styles.btnPrimary, { marginTop: spacing.sm }]}
            onPress={async () => {
              setRefreshing(true);
              await loadTodayMetrics();
              setRefreshing(false);
            }}
          >
            <Text style={styles.btnPrimaryText}>🔄 Actualizar datos del reloj</Text>
          </Pressable>
        </Section>
      )}

      {/* Mensaje cuando no hay datos */}
      {!todayMetrics && (permState === "granted" || permState === "partial") && (
        <Section title="📊 Datos de hoy">
          <Text style={styles.hint}>
            ⏳ Esperando datos de Mi Fitness...{"\n\n"}
            Asegúrate de que:{"\n"}
            1. Mi Fitness está instalado y sincronizado con tu smartwatch.{"\n"}
            2. Tu báscula Xiaomi S400 está vinculada en Mi Fitness.{"\n"}
            3. Mi Fitness tiene permisos en Health Connect (Ajustes → Health Connect → Permisos → Mi Fitness → Permitir).{"\n"}
            4. Pulsa "Actualizar datos del reloj" después de sincronizar.
          </Text>
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
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm, lineHeight: 19 },

  // === Dashboard de métricas ===
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  metricCard: {
    width: "47%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.dim
  },
  metricEmoji: { fontSize: 24, marginBottom: 4 },
  metricValue: { color: colors.bright, fontSize: 22, fontWeight: "900" },
  metricLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: "center" },

  // === Análisis inteligente ===
  summaryBox: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    marginBottom: spacing.sm
  },
  summaryTitle: { color: colors.accent, fontSize: 14, fontWeight: "800", marginBottom: spacing.sm },
  summaryTip: { color: colors.bright, fontSize: 12, lineHeight: 18, marginBottom: 4 },

  // === Fuente de datos ===
  dataSourceHint: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: spacing.xs,
    fontStyle: "italic"
  }
});
