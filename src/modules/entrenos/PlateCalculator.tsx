/**
 * PlateCalculator.tsx
 * ----------------------------------------------------------------------------
 * Calculadora visual de discos por lado de barra.
 *
 * Configuración:
 *   - Barra olímpica: 20 kg (configurable).
 *   - Discos disponibles: 25, 20, 15, 10, 5, 2.5, 1.25 kg (configurable).
 *
 * UI: muestra la barra con los discos a cada lado en proporción visual.
 */
import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Canvas, Rect, Circle, Line as SkiaLine } from "@shopify/react-native-skia";
import { colors, spacing, radius } from "@/theme/colors";

const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT = 20;

const PLATE_COLORS: Record<number, string> = {
  25: colors.error,    // rojo
  20: colors.bright,   // azul claro en código real, aquí blanco
  15: colors.bright,
  10: colors.bright,
  5: colors.bright,
  2.5: colors.bright,
  1.25: colors.bright
};

interface PlateStackItem { weightKg: number; count: number; }

export const PlateCalculator: React.FC = () => {
  const [targetKg, setTargetKg] = useState("60");
  const target = parseFloat(targetKg) || 0;

  const { perSide, remainder } = useMemo(() => {
    if (target <= BAR_WEIGHT) return { perSide: [] as PlateStackItem[], remainder: 0 };
    let sideWeight = (target - BAR_WEIGHT) / 2;
    const stack: PlateStackItem[] = [];
    for (const plate of STANDARD_PLATES) {
      let count = Math.floor(sideWeight / plate);
      if (count > 0) {
        stack.push({ weightKg: plate, count });
        sideWeight -= count * plate;
        sideWeight = Math.round(sideWeight * 100) / 100;
      }
    }
    return { perSide: stack, remainder: sideWeight * 2 };
  }, [target]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calculadora de discos</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={targetKg}
          onChangeText={setTargetKg}
          placeholder="Peso total"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.unit}>kg</Text>
      </View>

      <View style={styles.barSection}>
        <Canvas style={{ width: "100%", height: 140 }}>
          {/* Barra */}
          <Rect x={0} y={62} width={300} height={8} color={colors.dim} />
          {/* Discos lado izquierdo */}
          {renderPlates(perSide, "left").map((p, i) => (
            <Rect key={`l${i}`} x={p.x} y={p.y} width={p.w} height={p.h} color={p.color} />
          ))}
          {/* Discos lado derecho */}
          {renderPlates(perSide, "right").map((p, i) => (
            <Rect key={`r${i}`} x={p.x} y={p.y} width={p.w} height={p.h} color={p.color} />
          ))}
        </Canvas>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionLabel}>Discos por lado ({BAR_WEIGHT}kg barra)</Text>
        {perSide.length === 0 ? (
          <Text style={styles.empty}>Solo la barra</Text>
        ) : (
          perSide.map((p) => (
            <View key={p.weightKg} style={styles.plateRow}>
              <View style={[styles.plateChip, { backgroundColor: PLATE_COLORS[p.weightKg] + "22", borderColor: PLATE_COLORS[p.weightKg] }]}>
                <Text style={[styles.plateChipText, { color: PLATE_COLORS[p.weightKg] }]}>{p.weightKg}kg</Text>
              </View>
              <Text style={styles.plateCount}>×{p.count}</Text>
            </View>
          ))
        )}
        {remainder > 0 && (
          <Text style={styles.remainder}>
            ⚠ Faltan {remainder.toFixed(2)} kg (no hay discos pequeños suficientes)
          </Text>
        )}
      </View>
    </View>
  );
};

function renderPlates(stack: PlateStackItem[], side: "left" | "right") {
  const out: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const plateW = 8;
  const plateGap = 2;
  const startY = side === "left" ? 130 : 175;  // x del extremo de la barra
  let cursor = startY;
  for (const item of stack) {
    const h = 40 + item.weightKg * 1.2;
    const y = 70 - h / 2;
    for (let i = 0; i < item.count; i++) {
      const x = side === "left" ? cursor - plateW - plateGap : cursor + plateGap;
      out.push({ x, y, w: plateW, h, color: PLATE_COLORS[item.weightKg] });
      cursor = side === "left" ? x : x + plateW;
    }
  }
  return out;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  title: { color: colors.bright, fontSize: 18, fontWeight: "800", marginBottom: spacing.md },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, backgroundColor: colors.bg, color: colors.bright, fontSize: 18, fontWeight: "700", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim },
  unit: { color: colors.textMuted, fontWeight: "700" },
  barSection: { alignItems: "center", marginVertical: spacing.md },
  listSection: { marginTop: spacing.md },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  plateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 4 },
  plateChip: { paddingHorizontal: spacing.sm + 4, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1 },
  plateChipText: { fontWeight: "800", fontSize: 13 },
  plateCount: { color: colors.bright, fontWeight: "700", fontSize: 16 },
  remainder: { color: colors.warning, fontSize: 12, marginTop: spacing.sm }
});
