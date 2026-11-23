/**
 * App.tsx (Fase 3) - Entry point completo.
 */
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StyleSheet, Linking } from "react-native";

import { RootNavigator } from "@/navigation/RootNavigator";
import { useSettingsStore } from "@/store/settingsStore";
import { openDatabase } from "@/modules/persistence/db";
import { initDeviceIdentity } from "@/modules/cloud/deviceIdentity";
import { getSupabase, pingDevicePresence } from "@/modules/cloud/supabaseClient";
import { startSyncWorker } from "@/modules/sync/syncWorker";
import { audioCoach } from "@/modules/audioCoach/audioCoach";
import { widgetBridge } from "@/modules/widget/widgetBridge";
import { colors } from "@/theme/colors";

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);

  useEffect(() => {
    (async () => {
      await loadSettings();
      await openDatabase().catch(console.error);
      await initDeviceIdentity();
      try {
        await getSupabase();
        await pingDevicePresence();
      } catch (err) {
        console.warn("[App] Supabase no disponible, modo offline puro:", err);
      }
      startSyncWorker().catch(() => {});
      // Audio coach habilitado por defecto
      audioCoach.setEnabled(true);
      // Forzar refresh del widget al arrancar
      widgetBridge.updateWidget();
    })();
  }, [loadSettings]);

  // Deep linking handler: aiofitness://coach, //addwater/250, etc.
  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });
    Linking.getInitialURL().then(handleDeepLink);
    return () => sub.remove();
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
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

async function handleDeepLink(url: string | null) {
  if (!url) return;
  console.log("[App] deep link:", url);
  if (url.includes("addwater/")) {
    const match = url.match(/addwater\/(\d+)/);
    if (match) {
      const ml = parseInt(match[1]);
      const { addWater } = await import("@/modules/nutrition/foodRepo");
      await addWater(ml);
      widgetBridge.updateWidget();
    }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }
});
