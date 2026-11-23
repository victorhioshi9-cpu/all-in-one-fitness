/**
 * ComingSoon.tsx - Placeholder para pantallas que se implementan en Fase 2/3.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/theme/colors";

export const ComingSoon: React.FC<{ route?: any }> = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>En construcción</Text>
      <Text style={styles.subtitle}>Disponible en Fase 2 / Fase 3</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.lg
  },
  title: { color: colors.bright, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textMuted, marginTop: 8 }
});
