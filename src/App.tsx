/**
 - App.tsx (Fase 3) - Entry point completo con protección de inicio.
 */
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StyleSheet, Linking, View, Text, ScrollView } from "react-native";

import { RootNavigator } from "@/navigation/RootNavigator";
import { useSettingsStore } from "@/store/settingsStore";
import { openDatabase } from "@/modules/persistence/db";
import { initDeviceIdentity } from "@/modules/cloud/deviceIdentity";
import { getSupabase, pingDevicePresence } from "@/modules/cloud/supabaseClient";
import { startSyncWorker } from "@/modules/sync/syncWorker";
import { audioCoach } from "@/modules/audioCoach/audioCoach";
import { widgetBridge } from "@/modules/widget/widgetBridge";
import { colors } from "@/theme/colors";

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
          <Text style={styles.errorMsg}>{this.state.error.message}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);

  useEffect(() => {
    (async () => {
      try {
        if (loadSettings) await loadSettings();
      } catch (err) {
        console.warn("[App] loadSettings falló:", err);
      }

      try {
        await openDatabase();
      } catch (err) {
        console.warn("[App] openDatabase falló:", err);
      }

      try {
        await initDeviceIdentity();
      } catch (err) {
        console.warn("[App] initDeviceIdentity falló:", err);
      }

      try {
        await getSupabase();
        await pingDevicePresence();
      } catch (err) {
        console.warn("[App] Supabase no disponible, modo offline puro:", err);
      }

      try {
        await startSyncWorker();
      } catch (err) {
        console.warn("[App] startSyncWorker falló:", err);
      }

      try {
        audioCoach?.setEnabled?.(true);
      } catch (err) {
        console.warn("[App] audioCoach falló:", err);
      }

      try {
        await widgetBridge?.updateWidget?.();
      } catch (err) {
        console.warn("[App] widgetBridge falló:", err);
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
      primary: colors.accent
    }
  };

  return (
    <ScreenErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
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
  errorMsg: { color: "#fff", fontSize: 14 }
});
