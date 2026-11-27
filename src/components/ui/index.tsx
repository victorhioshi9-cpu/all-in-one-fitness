/**
 * ui/index.tsx - Primitivas de diseño reutilizables (Rediseño v0.5)
 *   Card, SectionHeader, Chip, PrimaryButton, ProgressRing
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { Canvas, Group, Path, Skia, LinearGradient, vec } from "@shopify/react-native-skia";
import { colors, radius, spacing, type, shadow } from "@/theme/colors";
import { Icon, type IconName } from "@/components/Icon";

// ---------------------------------------------------------------------------
export const Card: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  elevated?: boolean;
}> = ({ children, style, onPress, elevated }) => {
  const base = [styles.card, elevated && shadow.card, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
};

// ---------------------------------------------------------------------------
export const SectionHeader: React.FC<{
  title: string;
  action?: string;
  onAction?: () => void;
}> = ({ title, action, onAction }) => (
  <View style={styles.sectionRow}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && (
      <Pressable onPress={onAction} hitSlop={10}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    )}
  </View>
);

// ---------------------------------------------------------------------------
export const Chip: React.FC<{
  label: string;
  active?: boolean;
  icon?: IconName;
  color?: string;
  onPress?: () => void;
}> = ({ label, active, icon, color = colors.accent, onPress }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={[
      styles.chip,
      active && { backgroundColor: color, borderColor: color }
    ]}
  >
    {icon && <Icon name={icon} size={14} color={active ? "#08080c" : colors.textMuted} />}
    <Text style={[styles.chipText, active && { color: "#08080c" }]}>{label}</Text>
  </Pressable>
);

// ---------------------------------------------------------------------------
export const PrimaryButton: React.FC<{
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: "solid" | "ghost";
  style?: StyleProp<ViewStyle>;
}> = ({ label, icon, onPress, variant = "solid", style }) => {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        solid ? { backgroundColor: colors.accent } : { borderWidth: 1, borderColor: colors.accent },
        pressed && { opacity: 0.85 },
        style
      ]}
    >
      {icon && <Icon name={icon} size={18} color={solid ? "#08080c" : colors.accent} />}
      <Text style={[styles.btnText, { color: solid ? "#08080c" : colors.accent }]}>{label}</Text>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
/** Anillo de progreso estilo Apple Fitness (Skia, con degradado y puntas redondas). */
export const ProgressRing: React.FC<{
  progress: number;            // 0..1 (se recorta; >1 = anillo completo)
  size?: number;
  stroke?: number;
  gradient?: [string, string];
  label?: string;              // texto grande al centro
  sublabel?: string;           // texto pequeño al centro
}> = ({ progress, size = 96, stroke = 10, gradient = colors.gradientPrimary, label, sublabel }) => {
  const c = size / 2;
  const r = c - stroke / 2;
  const circle = React.useMemo(() => Skia.Path.Make().addCircle(c, c, r), [c, r]);
  const p = Math.max(0.001, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ width: size, height: size, position: "absolute" }}>
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={vec(c, c)}>
          <Path path={circle} style="stroke" strokeWidth={stroke} color={colors.dim} />
          <Path path={circle} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={p}>
            <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={gradient} />
          </Path>
        </Group>
      </Canvas>
      {label !== undefined && <Text style={styles.ringLabel}>{label}</Text>}
      {sublabel !== undefined && <Text style={styles.ringSub}>{sublabel}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line
  },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.xl, marginBottom: spacing.md
  },
  sectionTitle: { ...type.heading, color: colors.bright },
  sectionAction: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.dim,
    backgroundColor: colors.surface
  },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, paddingHorizontal: spacing.xl, borderRadius: radius.lg
  },
  btnText: { fontWeight: "800", fontSize: 15 },
  ringLabel: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  ringSub: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 1 }
});
