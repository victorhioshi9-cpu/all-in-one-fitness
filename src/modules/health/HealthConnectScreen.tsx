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
import { useIsFocused } from "@react-navigation/native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  checkAvailability,
  requestAllPermissions,
  getCurrentPermissionState,
  openHealthConnectInPlayStore,
  openHealthConnectApp,
  isNativeModuleLoaded,
  invalidateAvailabilityCache,
  getMissingReadPermissions,
  getLastReadErrors
} from "@/modules/health/healthConnectClient";
import type { Availability, PermissionState } from "@/modules/health/types";

import { readStepsForDay } from "@/modules/health/readers/stepsReader";
import { readHeartRateSummary } from "@/modules/health/readers/heartRateReader";
import { readCaloriesForDay } from "@/modules/health/readers/caloriesReader";
import { readSleepForDay } from "@/modules/health/readers/sleepReader";
import { readLatestBodyComposition } from "@/modules/health/readers/bodyCompositionReader";
import { readStressForDay } from "@/modules/health/readers/stressReader";
import { pushLastWorkoutToHealthConnect } from "@/modules/health/writers/workoutWriter";

import { forceDrainNow, isSyncRunning, getLastRunResult } from "@/modules/sync/syncWorker";
import { countPending } from "@/modules/cloud/syncService";
import { todayISO } from "@/modules/intelligence/dateUtils";
import { useSettingsStore } from "@/store/settingsStore";

/** Cada cuánto se vuelve a leer Health Connect mientras la pantalla está abierta. */
const LIVE_REFRESH_MS = 20_000;

function ago(ts: number | null | undefined): string {
  if (!ts) return "";
  const min = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

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

  const [missingPerms, setMissingPerms] = useState<{ type: string; label: string }[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const isFocused = useIsFocused();
  const manualFat = useSettingsStore((st) => st.bodyFatManualPct);

  /**
   * Lee todas las métricas de HOY. Es segura frente a llamadas solapadas
   * (el polling y el botón manual no se pisan).
   */
  const loadTodayMetrics = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const today = todayISO();
      // El cliente HC se inicializa una sola vez (promesa compartida), así que
      // lanzar las lecturas en paralelo ya no provoca "client is not initialized".
      const [steps, hr, cal, sleep, body, stress, missing] = await Promise.all([
        readStepsForDay(today).catch(() => null),
        readHeartRateSummary(today).catch(() => null),
        readCaloriesForDay(today).catch(() => null),
        readSleepForDay(today).catch(() => null),
        readLatestBodyComposition(90).catch(() => null),
        readStressForDay(today).catch(() => null),
        getMissingReadPermissions().catch(() => [])
      ]);
      setTodayMetrics({ steps, hr, cal, sleep, body, stress });
      setMissingPerms(missing);
      setLastUpdated(Date.now());
      // El % de grasa de la báscula alimenta el plan (Nutrición, Perfil, Mi plan).
      if (body?.bodyFatPct) useSettingsStore.getState().setScaleBodyFat(body.bodyFatPct);
    } finally {
      loadingRef.current = false;
    }
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


  // --- Sincronización en vivo con el reloj ---
  // Health Connect no "empuja" cambios: hay que consultarlo. Mientras esta
  // pantalla está visible y la app en primer plano se relee cada 20 s, y también
  // al volver a la app. (Los datos del reloj llegan a HC cuando Mi Fitness los
  // sincroniza: si el reloj marca más que la app, abre Mi Fitness una vez.)
  const canRead = permState === "granted" || permState === "partial";
  useEffect(() => {
    if (!canRead || !isFocused) return;
    loadTodayMetrics();
    const id = setInterval(() => {
      if (AppState.currentState === "active") loadTodayMetrics();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [canRead, isFocused, loadTodayMetrics]);

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

      {/* --- Permisos que faltan (Peso / % Grasa / Estatura…) --- */}
      {missingPerms.length > 0 && (permState === "granted" || permState === "partial") && (
        <Section title="⚠️ Faltan permisos de lectura">
          <Text style={styles.hint}>
            Sin estos permisos esos datos salen vacíos ("lacks the following permissions"):
          </Text>
          <Text style={[styles.hint, { color: colors.warning }]}>
            {missingPerms.map((m) => `• ${m.label}`).join("\n")}
          </Text>
          <Text style={styles.hint}>
            Abre Health Connect → Permisos de apps → All-in-One Fitness y activa todos.
          </Text>
          <Pressable style={styles.btnPrimary} onPress={openHealthConnectApp}>
            <Text style={styles.btnPrimaryText}>Abrir permisos de Health Connect</Text>
          </Pressable>
        </Section>
      )}

      {/* --- Dashboard de métricas del smartwatch + báscula --- */}
      {todayMetrics && (
        <Section title="📊 Datos de hoy (Mi Fitness + Báscula S400)">
          <Text style={styles.liveLine}>
            🟢 En vivo · actualizado {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"} · se refresca cada {LIVE_REFRESH_MS / 1000} s
          </Text>
          <View style={styles.metricsGrid}>
            {/* Pasos */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>👟</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.steps ? Math.round(todayMetrics.steps.value).toLocaleString() : "—"}
              </Text>
              <Text style={styles.metricLabel}>Pasos</Text>
            </View>

            {/* FC actual */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>❤️</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.hr ? `${todayMetrics.hr.latestBpm}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>
                FC actual (bpm){todayMetrics.hr ? `\n${ago(todayMetrics.hr.latestAt)}` : ""}
              </Text>
            </View>

            {/* FC reposo */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>🫀</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.hr?.restingBpm != null ? `${todayMetrics.hr.restingBpm}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>
                FC reposo (bpm){todayMetrics.hr ? `\nmedia ${todayMetrics.hr.avgBpm} · máx ${todayMetrics.hr.maxBpm}` : ""}
              </Text>
            </View>

            {/* Calorías activas */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>🔥</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.cal ? `${Math.round(todayMetrics.cal.activeKcal).toLocaleString()}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Kcal activas</Text>
            </View>

            {/* Calorías basales */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>💤</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.cal && todayMetrics.cal.basalSource !== "none" ? `${Math.round(todayMetrics.cal.basalKcal).toLocaleString()}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>
                Kcal basal{todayMetrics.cal?.basalSource === "profile" ? "\n(estimada con tu perfil)" : ""}
              </Text>
            </View>

            {/* Calorías totales */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>⚡</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.cal ? `${Math.round(todayMetrics.cal.totalKcal).toLocaleString()}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Kcal totales hoy</Text>
            </View>

            {/* Sueño */}
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>😴</Text>
              <Text style={styles.metricValue}>
                {todayMetrics.sleep && typeof todayMetrics.sleep.asleepMs === "number" && !isNaN(todayMetrics.sleep.asleepMs) ? `${(todayMetrics.sleep.asleepMs / 3600000).toFixed(1)}h` : "—"}
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
              <Text style={styles.metricLabel}>
                Peso (kg){todayMetrics.body?.measuredAt ? ` · ${new Date(todayMetrics.body.measuredAt).toLocaleDateString()}` : ""}
              </Text>
            </View>

            {/* % Grasa: báscula (HC) o, si no hay, el valor manual del perfil */}
            <View style={[styles.metricCard, { borderColor: colors.accent }]}>
              <Text style={styles.metricEmoji}>📏</Text>
              <Text style={[styles.metricValue, { color: colors.accent }]}>
                {todayMetrics.body?.bodyFatPct != null
                  ? `${Number(todayMetrics.body.bodyFatPct).toFixed(1)}`
                  : manualFat ? `${manualFat}` : "—"}
              </Text>
              <Text style={styles.metricLabel}>
                % Grasa{todayMetrics.body?.bodyFatPct == null ? (manualFat ? "\n(manual)" : "\nsin dato de la báscula") : "\n(báscula)"}
              </Text>
            </View>
          </View>

          {todayMetrics.body?.bodyFatPct == null && !manualFat && (
            <Text style={styles.hint}>
              💡 La báscula no ha enviado el % de grasa a Health Connect. En Mi Fitness abre la medición
              de la báscula y comprueba que "Grasa corporal" se comparte con Health Connect; mientras
              tanto puedes ponerlo a mano en Más → Mi perfil.
            </Text>
          )}
          {Object.keys(getLastReadErrors()).length > 0 && (
            <Text style={[styles.hint, { color: colors.warning }]}>
              Lecturas con error: {Object.keys(getLastReadErrors()).join(", ")} (revisa permisos).
            </Text>
          )}

          {/* Resumen inteligente */}
          {(todayMetrics.steps || todayMetrics.body?.weightKg || todayMetrics.cal) && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>🧠 Análisis inteligente</Text>
              {(() => {
                const weight = todayMetrics.body?.weightKg ?? 0;
                const bf = todayMetrics.body?.bodyFatPct ?? manualFat ?? null;
                const steps = todayMetrics.steps?.value ?? 0;
                const kcal = todayMetrics.cal?.activeKcal ?? 0;
                const rhr = todayMetrics.hr?.restingBpm ?? null;
                const tips: string[] = [];

                if (steps > 0) tips.push(`✅ ${Math.round(steps).toLocaleString()} pasos hoy — ${steps >= 10000 ? "¡Objetivo cumplido!" : `faltan ${Math.round(10000 - steps).toLocaleString()} para 10k`}`);
                if (kcal > 0) tips.push(`🔥 ${Math.round(kcal)} kcal activas quemadas`);
                if (weight > 0) tips.push(`⚖️ Peso: ${weight.toFixed(1)} kg`);
                if (bf != null && weight > 0) {
                  const leanMass = weight * (1 - bf / 100);
                  const fatMass = weight * (bf / 100);
                  tips.push(`📊 Masa magra: ${leanMass.toFixed(1)} kg · Masa grasa: ${fatMass.toFixed(1)} kg`);
                  if (bf > 25) tips.push(`⚠️ % grasa elevado (${Number(bf).toFixed(1)}%). Considera déficit calórico.`);
                  else if (bf < 12) tips.push(`✅ % grasa bajo (${Number(bf).toFixed(1)}%). Excelente definición.`);
                  else tips.push(`✅ % grasa en rango saludable (${Number(bf).toFixed(1)}%)`);
                }
                if (rhr != null) {
                  if (rhr > 80) tips.push(`⚠️ FC reposo alta (${rhr} bpm). Posible fatiga o estrés.`);
                  else if (rhr < 60) tips.push(`✅ FC reposo baja (${rhr} bpm). Buen estado cardiovascular.`);
                  else tips.push(`✅ FC reposo normal (${rhr} bpm)`);
                }
                if (todayMetrics.sleep && typeof todayMetrics.sleep.asleepMs === "number" && !isNaN(todayMetrics.sleep.asleepMs)) {
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

          <Text style={styles.dataSourceHint}>
            📡 Mi Fitness (reloj + báscula) → Health Connect → esta app. Si el reloj marca más pasos o kcal,
            abre Mi Fitness un momento para que sincronice y aquí se actualiza solo.
          </Text>

          <Pressable
            style={[styles.btnPrimary, { marginTop: spacing.sm }]}
            onPress={async () => {
              setRefreshing(true);
              await loadTodayMetrics();
              setRefreshing(false);
            }}
          >
            <Text style={styles.btnPrimaryText}>🔄 Actualizar ahora</Text>
          </Pressable>
        </Section>
      )}

      {/* Mensaje cuando no hay datos */}
      {(!todayMetrics || (todayMetrics && !todayMetrics.steps && !todayMetrics.body?.weightKg)) && (permState === "granted" || permState === "partial") && (
        <Section title="📊 Sin datos del reloj todavía">
          <Text style={styles.hint}>
            ⏳ No se recibieron datos de Mi Fitness. Pasos para solucionar:
          </Text>
          <Text style={styles.hint}>
            {"1️⃣ Abre Mi Fitness en tu teléfono y sincroniza el smartwatch (desliza abajo para refrescar)."}
            {"\n2️⃣ Súbelo a la báscula S400 para que envíe peso y % grasa."}
            {"\n3️⃣ Mi Fitness necesita permisos de ESCRITURA en Health Connect:"}
            {"\n   Ajustes → Health Connect → Permisos → Mi Fitness → Permitir todo"}
            {"\n4️⃣ Vuelve aquí y pulsa 'Actualizar datos del reloj'."}
          </Text>
          <Pressable
            style={[styles.btnPrimary, { marginTop: spacing.sm }]}
            onPress={() => {
              // Abrir ajustes de HC para que el usuario dé permisos a Mi Fitness
              openHealthConnectApp();
            }}
          >
            <Text style={styles.btnPrimaryText}>Abrir Health Connect</Text>
          </Pressable>
          <Pressable
            style={[styles.btnSecondary, { marginTop: spacing.sm }]}
            onPress={async () => {
              setRefreshing(true);
              await loadTodayMetrics();
              setRefreshing(false);
            }}
          >
            <Text style={styles.btnSecondaryText}>🔄 Actualizar datos del reloj</Text>
          </Pressable>
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

  liveLine: { color: colors.ok, fontSize: 11, marginBottom: spacing.sm },

  // === Fuente de datos ===
  dataSourceHint: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: spacing.xs,
    fontStyle: "italic"
  }
});
