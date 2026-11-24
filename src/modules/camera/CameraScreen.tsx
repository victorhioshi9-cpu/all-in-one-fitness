/**
 * CameraScreen.tsx — STUB MÍNIMO DE DIAGNÓSTICO (v0.3.3-emergency)
 * ----------------------------------------------------------------------------
 * Este es un stub temporal que SOLO importa React Native básico.
 * NO importa react-native-reanimated, react-native-vision-camera, hooks de
 * pose, ni nada que pueda estar bloqueando los toques.
 *
 * Objetivo: aislar el bug "no se puede tocar nada". Si con este stub los
 * botones SÍ responden y las tabs SÍ cambian, sabremos que el problema está
 * en las dependencias originales de CameraScreen (reanimated/vision-camera/
 * pose hooks) y podremos reactivarlas incrementalmente.
 *
 * Si con este stub los toques SIGUEN sin funcionar, el problema está en
 * App.tsx, RootNavigator, o gesture-handler global.
 *
 * Lo que hace este stub:
 *   1) Muestra el estado del permiso de cámara (sin pedirlo automáticamente).
 *   2) Botón "Conceder acceso" → usa Linking.openSettings() (NO usa
 *      cameraPerm.requestPermission() para evitar dependencias de vision-camera).
 *   3) Botón "Probar toque" → muestra un contador al pulsar para verificar
 *      que los toques funcionan.
 *
 * Para restaurar el CameraScreen completo, renombra CameraScreen.tsx.backup
 * de vuelta a CameraScreen.tsx.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert } from "react-native";

import { colors, spacing, radius } from "@/theme/colors";

export const CameraScreen: React.FC = () => {
  const [touchCount, setTouchCount] = useState(0);

  const handleConceder = () => {
    Alert.alert(
      "Permiso de cámara",
      "Para conceder el permiso, abre Ajustes → Aplicaciones → All-in-One Fitness → Permisos → Cámara → Permitir.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Abrir Ajustes",
          style: "default",
          onPress: () => Linking.openSettings().catch(() => {})
        }
      ]
    );
  };

  const handleTestTouch = () => {
    setTouchCount((c) => c + 1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coach AI</Text>
      <Text style={styles.subtitle}>Modo diagnóstico</Text>

      <Text style={styles.hint}>
        Esta es una versión minimalista de la pantalla de Coach para aislar el
        bug "no se puede tocar nada". Si puedes pulsar los botones de abajo y
        cambiar de pestaña en la barra inferior, el problema estaba en las
        dependencias originales de CameraScreen.
      </Text>

      <Pressable
        style={styles.btnPrimary}
        onPress={handleTestTouch}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={styles.btnPrimaryText}>Probar toque (contador: {touchCount})</Text>
      </Pressable>

      <Pressable
        style={[styles.btnPrimary, { backgroundColor: "rgba(255,255,255,0.08)", marginTop: spacing.md }]}
        onPress={handleConceder}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={[styles.btnPrimaryText, { color: colors.bright }]}>Conceder acceso a cámara</Text>
      </Pressable>

      <Text style={styles.footer}>
        Toques registrados: {touchCount}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    color: colors.bright,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.xs
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.xl
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 19,
    paddingHorizontal: spacing.md
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minWidth: 240,
    alignItems: "center"
  },
  btnPrimaryText: {
    color: colors.bg,
    fontWeight: "800",
    fontSize: 15
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xl
  }
});
