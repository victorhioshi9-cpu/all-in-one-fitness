/**
 * BodyMap.tsx - Cuerpo humano interactivo (Skia).
 * ----------------------------------------------------------------------------
 * - Vista frontal o trasera con zonas musculares tocables.
 * - Colores: primario (naranja), secundario (naranja tenue), seleccionado
 *   (naranja vivo + borde), o un mapa de colores propio (p.ej. recuperación).
 * - Sin react-native-svg: usa @shopify/react-native-skia (ya instalado), así
 *   que NO requiere un nuevo build nativo.
 *
 * Uso:
 *   <BodyMap view="front" width={220} selected={m} onSelect={setM} />
 *   <BodyMap view="back" primary={["lats"]} secondary={["biceps"]} />
 *   <BodyMap view="front" colorMap={{ chest: "#ef4444", quads: "#22c55e" }} />
 */
import React, { useMemo, useCallback } from "react";
import { Pressable, View, Text, StyleSheet, Vibration } from "react-native";
import { Canvas, Group, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { colors, radius, spacing } from "@/theme/colors";
import { BODY_VIEWBOX, BODY_ZONES, SILHOUETTE, type BodyView } from "./bodyPaths";
import type { MuscleId } from "./muscles";

// Paths compilados una sola vez (no por render).
interface CompiledZone { id: MuscleId; paths: SkPath[] }
const compiled: Partial<Record<BodyView, CompiledZone[]>> = {};
let silhouettePaths: SkPath[] | null = null;

const compile = (d: string): SkPath | null => {
  try { return Skia.Path.MakeFromSVGString(d); } catch { return null; }
};

function getSilhouette(): SkPath[] {
  if (!silhouettePaths) silhouettePaths = SILHOUETTE.map(compile).filter(Boolean) as SkPath[];
  return silhouettePaths;
}

function getZones(view: BodyView): CompiledZone[] {
  if (!compiled[view]) {
    compiled[view] = Object.entries(BODY_ZONES[view]).map(([id, ds]) => ({
      id: id as MuscleId,
      paths: ds.map(compile).filter(Boolean) as SkPath[]
    }));
  }
  return compiled[view]!;
}

export interface BodyMapProps {
  view: BodyView;
  /** Ancho en px; el alto se calcula con la proporción del dibujo. */
  width?: number;
  primary?: MuscleId[];
  secondary?: MuscleId[];
  selected?: MuscleId | null;
  /** Colores por músculo (tiene prioridad sobre primary/secondary). */
  colorMap?: Partial<Record<MuscleId, string>>;
  onSelect?: (id: MuscleId) => void;
}

const HIT_OFFSETS: [number, number][] = [
  [0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]
];

export const BodyMap: React.FC<BodyMapProps> = ({
  view, width = 220, primary, secondary, selected, colorMap, onSelect
}) => {
  const scale = width / BODY_VIEWBOX.w;
  const height = BODY_VIEWBOX.h * scale;
  const zones = useMemo(() => getZones(view), [view]);
  const sil = useMemo(() => getSilhouette(), []);

  const fillFor = (id: MuscleId): { fill: string; strong: boolean } => {
    if (selected === id) return { fill: colors.accent, strong: true };
    if (colorMap?.[id]) return { fill: colorMap[id]!, strong: false };
    if (primary?.includes(id)) return { fill: colors.accent, strong: false };
    if (secondary?.includes(id)) return { fill: colors.muscleSecondary, strong: false };
    return { fill: colors.muscleIdle, strong: false };
  };

  const handlePress = useCallback((e: any) => {
    if (!onSelect) return;
    const x = e.nativeEvent.locationX / scale;
    const y = e.nativeEvent.locationY / scale;
    for (const [dx, dy] of HIT_OFFSETS) {
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        for (const p of z.paths) {
          let hit = false;
          try { hit = p.contains(x + dx, y + dy); } catch { hit = false; }
          if (hit) {
            Vibration.vibrate(8);
            onSelect(z.id);
            return;
          }
        }
      }
    }
  }, [onSelect, scale, zones]);

  return (
    <Pressable onPress={handlePress} disabled={!onSelect} style={{ width, height }}>
      <Canvas style={{ width, height }} pointerEvents="none">
        <Group transform={[{ scale }]}>
          {sil.map((p, i) => (
            <Path key={`s${i}`} path={p} color={colors.silhouette} style="fill" />
          ))}
          {zones.map((z) => {
            const { fill, strong } = fillFor(z.id);
            return z.paths.map((p, i) => (
              <React.Fragment key={`${z.id}${i}`}>
                <Path path={p} color={fill} style="fill" />
                <Path
                  path={p}
                  color={strong ? "#ffffff" : colors.bg}
                  style="stroke"
                  strokeWidth={strong ? 1.4 : 0.8}
                />
              </React.Fragment>
            ));
          })}
        </Group>
      </Canvas>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Selector Frente / Espalda
// ---------------------------------------------------------------------------
export const BodyViewToggle: React.FC<{
  view: BodyView;
  onChange: (v: BodyView) => void;
}> = ({ view, onChange }) => (
  <View style={styles.toggle}>
    {(["front", "back"] as BodyView[]).map((v) => {
      const active = view === v;
      return (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          style={[styles.toggleBtn, active && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
            {v === "front" ? "Frente" : "Espalda"}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line
  },
  toggleBtn: { paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.xl },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  toggleTextActive: { color: "#08080c" }
});
