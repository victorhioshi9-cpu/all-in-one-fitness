/**
 * NutritionScreen.tsx
 * ----------------------------------------------------------------------------
 * Pantalla de Nutrición (Fase 3):
 *   - Resumen de macros de hoy (kcal, P/C/F, fibra) con barras de progreso.
 *   - Plantillas rápidas (combos) de 1 toque + buscador de alimentos.
 *   - Botón escáner barcode.
 *   - Agua diaria con botones rápidos (+250, +500).
 *   - Suplementos diarios.
 *   - Comparativa visual cronológica (peso semanal).
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Modal, TextInput, FlatList
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  ensurePreloadedFoods, searchFoods, getAllFoods, logFood,
  getDailyMacros, addWater, getDailyWater, getDailySupplements, type FoodRow
} from "./foodRepo";
import { BarcodeScannerScreen } from "./BarcodeScannerScreen";
import { readWeightHistory } from "@/modules/health/readers/bodyCompositionReader";

export const NutritionScreen: React.FC = () => {
  const [macros, setMacros] = useState<any>(null);
  const [water, setWater] = useState(0);
  const [supplements, setSupplements] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodRow[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState(100);
  const [weightHistory, setWeightHistory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await ensurePreloadedFoods();
    const [m, w, s, wh] = await Promise.all([
      getDailyMacros(),
      getDailyWater(),
      getDailySupplements(),
      readWeightHistory(30).catch(() => [])
    ]);
    setMacros(m);
    setWater(w);
    setSupplements(s);
    setWeightHistory(wh);
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const doSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const r = await searchFoods(q);
    setResults(r);
  }, []);

  const handleLogFood = async () => {
    if (!selectedFood) return;
    await logFood({ foodId: selectedFood.id, grams });
    setSelectedFood(null);
    setGrams(100);
    await refresh();
  };

  const targetKcal = 2200;
  const targetProtein = 180;
  const targetCarbs = 220;
  const targetFat = 70;
  const targetWater = 3000;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Nutrición</Text>

      {/* Macros hoy */}
      {macros && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hoy</Text>
          <MacroBar label="Calorías" value={macros.kcal} target={targetKcal} unit="kcal" color={colors.accent} />
          <MacroBar label="Proteína" value={macros.protein_g} target={targetProtein} unit="g" color={colors.ok} />
          <MacroBar label="Carbohidratos" value={macros.carbs_g} target={targetCarbs} unit="g" color={colors.concentric} />
          <MacroBar label="Grasas" value={macros.fat_g} target={targetFat} unit="g" color={colors.bottom} />
          <MacroBar label="Fibra" value={macros.fiber_g ?? 0} target={30} unit="g" color={colors.textMuted} />
        </View>
      )}

      {/* Acciones rápidas */}
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={() => setShowSearch(true)}>
          <Text style={styles.actionText}>+ Comida</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => setShowScanner(true)}>
          <Text style={styles.actionText}>Escanear</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => addWater(250).then(refresh)}>
          <Text style={styles.actionText}>+ 250ml</Text>
        </Pressable>
      </View>

      {/* Agua */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Agua</Text>
        <Text style={styles.bigValue}>{water} ml</Text>
        <View style={styles.waterBar}>
          <View style={[styles.waterBarFill, { width: `${Math.min(100, water / targetWater * 100)}%` }]} />
        </View>
        <Text style={styles.muted}>Objetivo: {targetWater} ml</Text>
        <View style={styles.waterButtons}>
          <Pressable style={styles.waterBtn} onPress={() => addWater(250).then(refresh)}>
            <Text style={styles.waterBtnText}>+250</Text>
          </Pressable>
          <Pressable style={styles.waterBtn} onPress={() => addWater(500).then(refresh)}>
            <Text style={styles.waterBtnText}>+500</Text>
          </Pressable>
          <Pressable style={styles.waterBtn} onPress={() => addWater(1000).then(refresh)}>
            <Text style={styles.waterBtnText}>+1L</Text>
          </Pressable>
        </View>
      </View>

      {/* Suplementos hoy */}
      {supplements.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Suplementos</Text>
          {supplements.map((s) => (
            <View key={s.id} style={styles.suppRow}>
              <Text style={styles.suppName}>{s.name}</Text>
              <Text style={styles.suppDose}>{s.dose}{s.unit}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Comparativa visual de peso */}
      {weightHistory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evolución de peso (30 días)</Text>
          <WeightSparkline data={weightHistory} />
          <View style={styles.weightRange}>
            <Text style={styles.muted}>Mín: {Math.min(...weightHistory.map(w => w.weightKg)).toFixed(1)} kg</Text>
            <Text style={styles.muted}>Máx: {Math.max(...weightHistory.map(w => w.weightKg)).toFixed(1)} kg</Text>
            <Text style={styles.muted}>Actual: {weightHistory[weightHistory.length - 1].weightKg.toFixed(1)} kg</Text>
          </View>
        </View>
      )}

      {/* Buscador Modal */}
      <Modal visible={showSearch} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Buscar alimento</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: pollo, arroz, whey…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={doSearch}
            autoFocus
          />
          {results.length === 0 && query.length > 0 && (
            <Text style={styles.noResults}>Sin resultados</Text>
          )}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.foodItem} onPress={() => { setSelectedFood(item); setShowSearch(false); }}>
                <Text style={styles.foodName}>{item.name}</Text>
                <Text style={styles.foodMeta}>
                  {item.kcal} kcal · {item.protein_g}P · {item.carbs_g}C · {item.fat_g}F {item.is_supplement ? "· supp" : ""}
                </Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.closeModalBtn} onPress={() => setShowSearch(false)}>
            <Text style={styles.closeModalText}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Modal gramos */}
      <Modal visible={!!selectedFood} animationType="slide" transparent={true}>
        {selectedFood && (
          <View style={styles.gramsModal}>
            <Text style={styles.modalTitle}>{selectedFood.name}</Text>
            <Text style={styles.foodMeta}>
              {selectedFood.kcal} kcal · {selectedFood.protein_g}P · {selectedFood.carbs_g}C · {selectedFood.fat_g}F
              {" / 100" + selectedFood.serving_unit}
            </Text>
            <View style={styles.gramsRow}>
              <Pressable style={styles.stepBtn} onPress={() => setGrams(Math.max(10, grams - 25))}>
                <Text style={styles.stepBtnText}>-25</Text>
              </Pressable>
              <Text style={styles.gramsValue}>{grams}{selectedFood.serving_unit === "unidad" ? " un" : selectedFood.serving_unit}</Text>
              <Pressable style={styles.stepBtn} onPress={() => setGrams(grams + 25)}>
                <Text style={styles.stepBtnText}>+25</Text>
              </Pressable>
            </View>
            <Text style={styles.calcPreview}>
              {Math.round(selectedFood.kcal * (selectedFood.serving_unit === "unidad" ? grams : grams / 100))} kcal ·
              {" "} {Math.round(selectedFood.protein_g * (selectedFood.serving_unit === "unidad" ? grams : grams / 100))}g proteína
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setSelectedFood(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleLogFood}>
                <Text style={styles.confirmText}>Añadir</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" transparent={false}>
        <BarcodeScannerScreen onClose={() => { setShowScanner(false); refresh(); }} />
      </Modal>
    </ScrollView>
  );
};

// --- Subcomponentes --------------------------------------------------------
const MacroBar: React.FC<{ label: string; value: number; target: number; unit: string; color: string }> = ({
  label, value, target, unit, color
}) => {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{Math.round(value)} / {target} {unit}</Text>
      </View>
      <View style={styles.macroBar}>
        <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

const WeightSparkline: React.FC<{ data: { day: string; weightKg: number }[] }> = ({ data }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data.map(d => d.weightKg));
  const max = Math.max(...data.map(d => d.weightKg));
  const range = max - min || 1;
  return (
    <View style={styles.sparklineContainer}>
      <View style={styles.sparkline}>
        {data.map((d, i) => {
          const heightPct = ((d.weightKg - min) / range) * 100;
          return (
            <View key={i} style={[styles.sparkBar, { height: `${Math.max(5, heightPct)}%` }]} />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800", marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim
  },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md },
  bigValue: { color: colors.concentric, fontSize: 32, fontWeight: "900" },
  muted: { color: colors.textMuted, fontSize: 12 },
  macroRow: { marginBottom: spacing.sm },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  macroLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  macroValue: { color: colors.bright, fontSize: 13, fontWeight: "700" },
  macroBar: { height: 6, backgroundColor: colors.dim, borderRadius: 3, overflow: "hidden" },
  macroBarFill: { height: "100%", borderRadius: 3 },
  waterBar: { height: 12, backgroundColor: colors.dim, borderRadius: 6, overflow: "hidden", marginVertical: spacing.sm },
  waterBarFill: { height: "100%", backgroundColor: colors.concentric, borderRadius: 6 },
  waterButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  waterBtn: { flex: 1, backgroundColor: "rgba(6,182,212,0.15)", paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: "center" },
  waterBtnText: { color: colors.concentric, fontWeight: "800", fontSize: 14 },
  suppRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  suppName: { color: colors.bright, fontSize: 14 },
  suppDose: { color: colors.textMuted, fontSize: 14 },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  actionBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  actionText: { color: "#08080c", fontWeight: "800", fontSize: 14 },
  weightRange: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  sparklineContainer: { height: 80, marginTop: spacing.sm },
  sparkline: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  sparkBar: { flex: 1, backgroundColor: colors.accent, borderRadius: 1, minHeight: 4 },
  // Modales
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalTitle: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  input: {
    backgroundColor: colors.bgCard, color: colors.bright, fontSize: 16,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.md
  },
  noResults: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  foodItem: { backgroundColor: colors.bgCard, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.dim },
  foodName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  foodMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  closeModalBtn: { backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  closeModalText: { color: colors.bright, fontWeight: "700" },
  gramsModal: { backgroundColor: colors.bgCard, margin: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, marginTop: "30%" },
  gramsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: spacing.md },
  stepBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.sm, minWidth: 70, alignItems: "center" },
  stepBtnText: { color: colors.bright, fontWeight: "700" },
  gramsValue: { color: colors.bright, fontSize: 26, fontWeight: "800" },
  calcPreview: { color: colors.ok, fontSize: 14, fontWeight: "700", textAlign: "center" },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  cancelText: { color: colors.bright, fontWeight: "700" },
  confirmBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  confirmText: { color: "#08080c", fontWeight: "800" }
});
