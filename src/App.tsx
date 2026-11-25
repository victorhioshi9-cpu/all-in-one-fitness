/**
 * App.tsx (Rediseño v0.4) - Entry point completo con diagnóstico por paso.
 *
 * CAMBIO v0.4: si `onboardingCompleted` es false en el settingsStore,
 * renderiza <OnboardingScreen /> en lugar del RootNavigator. El usuario debe
 * completar el wizard (género, edad, altura, peso, actividad, objetivo) antes
 * de acceder a las tabs principales.
 *
 * Mantiene:
 *   - Loop de startup que distingue pasos críticos vs best-effort.
 *   - ScreenErrorBoundary.
 *   - Deep link handling (addwater/:ml).
 *   - Tema oscuro y SafeAreaProvider.
 */
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StyleSheet, Linking, Text, ScrollView } from "react-native";

// debugLogger intercepta console.log/warn/error globalmente para que los logs
// se vean en el DebugLogPanel (botón 🐞 flotante). Importar lo antes posible.
import "@/utils/debugLogger";
import { DebugLogPanel } from "@/utils/DebugLogPanel";

import { RootNavigator } from "@/navigation/RootNavigator";
import { useSettingsStore } from "@/store/settingsStore";
import { OnboardingScreen } from "@/modules/onboarding/OnboardingScreen";
import { openDatabase } from "@/modules/persistence/db";
import { initDeviceIdentity } from "@/modules/cloud/deviceIdentity";
import { getSupabase, pingDevicePresence } from "@/modules/cloud/supabaseClient";
import { startSyncWorker } from "@/modules/sync/syncWorker";
import { audioCoach } from "@/modules/audioCoach/audioCoach";
import { widgetBridge } from "@/modules/widget/widgetBridge";
import { colors } from "@/theme/colors";

// Pasos cuyo fallo NO debe bloquear el arranque de la UI.
const BEST_EFFORT_STEPS = new Set([
  "supabase",
  "startSyncWorker",
  "audioCoach",
  "widgetBridge"
]);

class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.errorBox}>
          <Text style={styles.errorTitle}>Error al iniciar la app:</Text>
          <Text style={styles.errorMsg}>
            [Render] {this.state.error?.message || String(this.state.error)}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const steps: Array<[string, () => Promise<unknown> | unknown]> = [
        ["loadSettings", () => loadSettings?.()],
        ["openDatabase", () => openDatabase()],
        ["initDeviceIdentity", () => initDeviceIdentity()],
        [
          "supabase",
          async () => {
            await getSupabase();
            await pingDevicePresence();
          },
        ],
        ["startSyncWorker", () => startSyncWorker()],
        ["audioCoach", () => audioCoach?.setEnabled?.(true)],
        ["widgetBridge", () => widgetBridge?.updateWidget?.()],
      ];

      for (const [name, fn] of steps) {
        try {
          await fn();
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (BEST_EFFORT_STEPS.has(name)) {
            // No bloqueamos: la app puede seguir sin este paso.
            console.warn(`[App] paso best-effort falló [${name}]: ${msg}`);
            continue;
          }
          // Paso crítico: bloqueamos y mostramos error.
          setStartupError(`[${name}] ${msg}`);
          return;
        }
      }
    })();
  }, [loadSettings]);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    try {
      sub = Linking.addEventListener("url", (event) => {
        handleDeepLink(event.url).catch(() => {});
      });
      Linking.getInitialURL()
        .then((url) => handleDeepLink(url))
        .catch(() => {});
    } catch (err) {
      console.warn("[App] Linking falló:", err);
    }
    return () => {
      try {
        sub?.remove?.();
      } catch {}
    };
  }, []);

  const navTheme = {
    ...DarkTheme,
    dark: true,
    colors: {
      ...DarkTheme.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.bright,
      border: colors.dim,
      primary: colors.accent,
    },
  };

  if (startupError) {
    return (
      <ScrollView style={styles.errorBox}>
        <Text style={styles.errorTitle}>Error al iniciar la app:</Text>
        <Text style={styles.errorMsg}>{startupError}</Text>
      </ScrollView>
    );
  }

  // Si el usuario no ha completado el onboarding, mostramos el wizard.
  // El RootNavigator completo (con NavigationContainer) se carga solo después.
  if (!onboardingCompleted) {
    return (
      <ScreenErrorBoundary>
        <GestureHandlerRootView style={styles.root}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <OnboardingScreen />
            <DebugLogPanel />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
          <DebugLogPanel />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ScreenErrorBoundary>
  );
}

async function handleDeepLink(url: string | null) {
  if (!url) return;
  try {
    if (url.includes("addwater/")) {
      const match = url.match(/addwater\/(\d+)/);
      if (match) {
        const ml = parseInt(match[1], 10);
        const { addWater } = await import("@/modules/nutrition/foodRepo");
        await addWater(ml);
        await widgetBridge?.updateWidget?.();
      }
    }
  } catch (err) {
    console.warn("[App] handleDeepLink falló:", err);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  errorBox: { flex: 1, padding: 20, backgroundColor: "#111" },
  errorTitle: { color: "#ff5555", fontWeight: "bold", fontSize: 18, marginBottom: 10 },
  errorMsg: { color: "#fff", fontSize: 14 },
});
