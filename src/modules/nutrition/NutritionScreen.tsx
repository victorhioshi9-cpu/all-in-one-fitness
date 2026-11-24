/**
 * NutritionScreen.tsx (Rediseño v0.4)
 * ----------------------------------------------------------------------------
 * Pantalla de Nutrición rediseñada:
 *   - Card superior con macros diarios + objetivo (kcal/proteína) desde el
 *     settingsStore. Cuatro barras con emoji + color por macro.
 *   - Chips horizontales por categoría: Proteínas, Carbohidratos, Vegetales,
 *     Lácteos, Grasas, Suplementos, Platillos, Bebidas, Combos. Filtran la
 *     lista inferior.
 *   - Cada alimento: emoji por keyword, nombre, badge "Crudo" (azul) o
 *     "Cocido" (naranja) cuando aplica, kcal/100g, P/C/F.
 *   - Botón "+ Comida": bottom-sheet con buscador + categorías + escáner.
 *   - Agua con botones grandes +250/+500/+1L.
 *   - Conserva: agua diaria, suplementos diarios, evolución de peso.
 *
 * Sin instalar nuevos paquetes: usa View/Pressable/ScrollView de RN.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
  Modal, TextInput, FlatList
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import {
  ensurePreloadedFoods, searchFoods, getAllFoods, logFood,
  getDailyMacros, addWater, getDailyWater, getDailySupplements,
  type FoodRow
} from "./foodRepo";
import { BarcodeScannerScreen } from "./BarcodeScannerScreen";
import { readWeightHistory } from "@/modules/health/readers/bodyCompositionReader";
import { useSettingsStore } from "@/store/settingsStore";

// ============================================================================
// Categorías de alimento (chips)
// ============================================================================
export type FoodCategory =
  | "all" | "protein" | "carbs" | "veg" | "dairy"
  | "fat" | "supp" | "dish" | "drink" | "combo";

interface CategoryMeta {
  value: FoodCategory;
  label: string;
  emoji: string;
  color: string;
}

const CATEGORIES: CategoryMeta[] = [
  { value: "all",     label: "Todo",          emoji: "🍽", color: colors.bright },
  { value: "protein", label: "Proteínas",     emoji: "🔴", color: colors.catProtein },
  { value: "carbs",   label: "Carbohidratos", emoji: "🟡", color: colors.catCarbs },
  { value: "veg",     label: "Vegetales",     emoji: "🟢", color: colors.catVeg },
  { value: "dairy",   label: "Lácteos",       emoji: "🔵", color: colors.catDairy },
  { value: "fat",     label: "Grasas",        emoji: "🥜", color: colors.catFat },
  { value: "supp",    label: "Suplementos",   emoji: "💊", color: colors.catSupp },
  { value: "dish",    label: "Platillos",     emoji: "🍽", color: colors.catDish },
  { value: "drink",   label: "Bebidas",       emoji: "🥤", color: colors.catDrink },
  { value: "combo",   label: "Combos",        emoji: "⭐", color: colors.catCombo }
];

// ============================================================================
// Clasificador por keywords en el nombre del alimento
// ============================================================================
const PROTEIN_KW = [
  "pollo", "res", "carne", "salmón", "salmon", "atún", "atun", "huevo", "merluza",
  "pavo", "tofu", "garbanzos", "lentejas", "frijoles", "whey", "creatina", "bcaa",
  "maca", "pechuga", "claro", "albúmina", "anticucho", "chicharrón"
];
const CARB_KW = [
  "arroz", "papa", "camote", "avena", "pan", "pasta", "quinoa", "plátano", "platano",
  "manzana", "yuca", "maltodextrina", "fresa", "arándanos", "arandanos", "papaya",
  "mango", "tallarín", "tallarin", "causa", "tamal", "humita", "empanada"
];
const DAIRY_KW = ["yogur", "leche", "queso", "cottage", "evaporada", "mozzarella"];
const FAT_KW = ["almendra", "maní", "mani", "nuez", "aceite", "palta", "aguacate", "mantequilla", "chía", "chia"];
const SUPP_KW = ["whey", "creatina", "cafeína", "cafeina", "bcaa", "maltodextrina", "maca"];
const DISH_KW = [
  "ceviche", "lomo saltado", "ají de gallina", "aji de gallina", "causa limeña",
  "tallarín rojo", "tallarin rojo", "empanada", "tamal", "tamale", "humita",
  "arroz chaufa", "anticucho", "chicharrón"
];
const DRINK_KW = ["café", "cafe", "té", "te", "gatorade", "cerveza"];

function classifyFood(name: string, isSupplement: boolean, isCombo: boolean): FoodCategory {
  const n = name.toLowerCase();
  if (isCombo) return "combo";
  if (isSupplement) return "supp";
  if (DISH_KW.some(kw => n.includes(kw))) return "dish";
  if (DRINK_KW.some(kw => n.includes(kw))) return "drink";
  if (FAT_KW.some(kw => n.includes(kw))) return "fat";
  if (DAIRY_KW.some(kw => n.includes(kw))) return "dairy";
  if (PROTEIN_KW.some(kw => n.includes(kw))) return "protein";
  if (CARB_KW.some(kw => n.includes(kw))) return "carbs";
  // Default por macronutriente dominante
  return "veg";
}

// ============================================================================
// Emoji por nombre del alimento
// ============================================================================
const EMOJI_RULES: Array<{ kw: string; emoji: string }> = [
  { kw: "pollo", emoji: "🍗" },
  { kw: "res", emoji: "🥩" },
  { kw: "carne", emoji: "🥩" },
  { kw: "salmón", emoji: "🐟" },
  { kw: "salmon", emoji: "🐟" },
  { kw: "atún", emoji: "🐟" },
  { kw: "atun", emoji: "🐟" },
  { kw: "merluza", emoji: "🐟" },
  { kw: "huevo", emoji: "🥚" },
  { kw: "clara", emoji: "🥚" },
  { kw: "pavo", emoji: "🦃" },
  { kw: "tofu", emoji: "🥡" },
  { kw: "garbanzo", emoji: "🫘" },
  { kw: "lenteja", emoji: "🫘" },
  { kw: "frijol", emoji: "🫘" },
  { kw: "arroz", emoji: "🍚" },
  { kw: "papa", emoji: "🥔" },
  { kw: "camote", emoji: "🍠" },
  { kw: "avena", emoji: "🥣" },
  { kw: "pan", emoji: "🍞" },
  { kw: "pasta", emoji: "🍝" },
  { kw: "tallarín", emoji: "🍝" },
  { kw: "quinoa", emoji: "🌾" },
  { kw: "plátano", emoji: "🍌" },
  { kw: "platano", emoji: "🍌" },
  { kw: "manzana", emoji: "🍎" },
  { kw: "fresa", emoji: "🍓" },
  { kw: "arándano", emoji: "🫐" },
  { kw: "arandano", emoji: "🫐" },
  { kw: "papaya", emoji: "🥭" },
  { kw: "mango", emoji: "🥭" },
  { kw: "yuca", emoji: "🥔" },
  { kw: "yogur", emoji: "🥛" },
  { kw: "leche", emoji: "🥛" },
  { kw: "queso", emoji: "🧀" },
  { kw: "cottage", emoji: "🧀" },
  { kw: "almendra", emoji: "🌰" },
  { kw: "maní", emoji: "🥜" },
  { kw: "mani", emoji: "🥜" },
  { kw: "nuez", emoji: "🌰" },
  { kw: "aceite", emoji: "🫒" },
  { kw: "palta", emoji: "🥑" },
  { kw: "aguacate", emoji: "🥑" },
  { kw: "mantequilla", emoji: "🥜" },
  { kw: "chía", emoji: "🌱" },
  { kw: "chia", emoji: "🌱" },
  { kw: "whey", emoji: "💪" },
  { kw: "creatina", emoji: "💊" },
  { kw: "cafeína", emoji: "💊" },
  { kw: "cafeina", emoji: "💊" },
  { kw: "bcaa", emoji: "💊" },
  { kw: "maltodextrina", emoji: "💊" },
  { kw: "maca", emoji: "💊" },
  { kw: "brócoli", emoji: "🥦" },
  { kw: "espinaca", emoji: "🥬" },
  { kw: "tomate", emoji: "🍅" },
  { kw: "zanahoria", emoji: "🥕" },
  { kw: "lechuga", emoji: "🥬" },
  { kw: "cebolla", emoji: "🧅" },
  { kw: "pimiento", emoji: "🫑" },
  { kw: "calabacín", emoji: "🥒" },
  { kw: "ceviche", emoji: "🍲" },
  { kw: "lomo saltado", emoji: "🍲" },
  { kw: "ají de gallina", emoji: "🍲" },
  { kw: "aji de gallina", emoji: "🍲" },
  { kw: "causa", emoji: "🥘" },
  { kw: "tamal", emoji: "🌽" },
  { kw: "humita", emoji: "🌽" },
  { kw: "empanada", emoji: "🥟" },
  { kw: "chicharrón", emoji: "🍗" },
  { kw: "anticucho", emoji: "🍢" },
  { kw: "arroz chaufa", emoji: "🍜" },
  { kw: "café", emoji: "☕" },
  { kw: "cafe", emoji: "☕" },
  { kw: "té", emoji: "🍵" },
  { kw: "gatorade", emoji: "🧃" },
  { kw: "cerveza", emoji: "🍺" }
];

function emojiForFood(name: string, fallback: string): string {
  const n = name.toLowerCase();
  for (const rule of EMOJI_RULES) {
    if (n.includes(rule.kw)) return rule.emoji;
  }
  return fallback;
}

function cookingState(name: string): "raw" | "cooked" | null {
  const n = name.toLowerCase();
  if (n.includes("crudo") || n.includes("cruda")) return "raw";
  if (n.includes("cocido") || n.includes("cocida") || n.includes("sancochada")) return "cooked";
  return null;
}

// ============================================================================
// Tipos extendidos para evitar errores de tsc con combos
// ============================================================================
type FoodRowExt = FoodRow & { combo_items?: string | null };

// ============================================================================
// Pantalla principal
// ============================================================================
export const NutritionScreen: React.FC = () => {
  const targetKcal = useSettingsStore((s) => s.targetKcalDay) ?? 2200;
  const targetProtein = useSettingsStore((s) => s.targetProteinG) ?? 150;
  const targetCarbs = 220;
  const targetFat = 70;
  const targetWater = 3000;

  const [macros, setMacros] = useState<any>(null);
  const [water, setWater] = useState(0);
  const [supplements, setSupplements] = useState<any[]>([]);
  const [allFoods, setAllFoods] = useState<FoodRowExt[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory>("all");
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
    try {
      await ensurePreloadedFoods();
      const [m, w, s, wh, foods] = await Promise.all([
        getDailyMacros(),
        getDailyWater(),
        getDailySupplements(),
        readWeightHistory(30).catch(() => []),
        getAllFoods()
      ]);
      setMacros(m);
      setWater(w);
      setSupplements(s);
      setWeightHistory(wh);
      setAllFoods(foods as FoodRowExt[]);
    } catch (err) {
      console.warn("[NutritionScreen] refresh falló:", err);
    } finally {
      setRefreshing(false);
    }
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
    try {
      await logFood({ foodId: selectedFood.id, grams });
      setSelectedFood(null);
      setGrams(100);
      await refresh();
    } catch (err) {
      console.warn("[NutritionScreen] logFood falló:", err);
    }
  };

  const filteredFoods = useMemo(() => {
    const list = allFoods
      .filter((f) => {
        if (selectedCategory === "all") return true;
        const cat = classifyFood(f.name, !!f.is_supplement, !!f.is_combo);
        return cat === selectedCategory;
      });
    // Ordena por kcal/100g descendente dentro de proteínas y carbs, alfabético en resto
    if (selectedCategory === "protein" || selectedCategory === "carbs") {
      list.sort((a, b) => b.kcal - a.kcal);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [allFoods, selectedCategory]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Nutrición</Text>
      <Text style={styles.subtitle}>Tu objetivo diario y registro de comidas</Text>

      {/* === Card: Macros hoy con objetivo === */}
      {macros && (
        <View style={styles.macrosCard}>
          <View style={styles.macrosHeader}>
            <Text style={styles.cardTitle}>Hoy</Text>
            <Text style={styles.macrosKcal}>
              {Math.round(macros.kcal)} / {targetKcal} kcal
            </Text>
          </View>
          <MacroBar
            emoji="🔥" label="Calorías" value={macros.kcal} target={targetKcal}
            unit="kcal" color={colors.accent}
          />
          <MacroBar
            emoji="🥩" label="Proteína" value={macros.protein_g} target={targetProtein}
            unit="g" color={colors.catProtein}
          />
          <MacroBar
            emoji="🍚" label="Carbohidratos" value={macros.carbs_g} target={targetCarbs}
            unit="g" color={colors.catCarbs}
          />
          <MacroBar
            emoji="🥑" label="Grasas" value={macros.fat_g} target={targetFat}
            unit="g" color={colors.catFat}
          />
          <MacroBar
            emoji="🌾" label="Fibra" value={macros.fiber_g ?? 0} target={30}
            unit="g" color={colors.catVeg}
          />
        </View>
      )}

      {/* === Card: Tu objetivo hoy === */}
      <View style={styles.objectiveCard}>
        <Text style={styles.cardTitle}>Tu objetivo hoy</Text>
        <View style={styles.objectiveGrid}>
          <ObjectiveStat
            label="Calorías" emoji="🔥"
            value={Math.round(macros?.kcal ?? 0)} target={targetKcal} unit="kcal"
            color={colors.accent}
          />
          <ObjectiveStat
            label="Proteína" emoji="🥩"
            value={Math.round(macros?.protein_g ?? 0)} target={targetProtein} unit="g"
            color={colors.catProtein}
          />
        </View>
        <Text style={styles.objectiveHint}>
          {targetKcal === 2200 && targetProtein === 150
            ? "Configura tu perfil en 'Mi perfil' para personalizar objetivos."
            : "Objetivos calculados desde tu perfil (Mifflin-St Jeor + actividad)."}
        </Text>
      </View>

      {/* === Chips de categoría === */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg, paddingVertical: 4 }}
      >
        {CATEGORIES.map((c) => {
          const active = selectedCategory === c.value;
          return (
            <Pressable
              key={c.value}
              style={[styles.catChip, active && { backgroundColor: c.color, borderColor: c.color }]}
              onPress={() => setSelectedCategory(c.value)}
            >
              <Text style={styles.catChipEmoji}>{c.emoji}</Text>
              <Text style={[styles.catChipLabel, active && styles.catChipLabelActive]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* === Lista de alimentos filtrada === */}
      <View style={styles.foodListHeader}>
        <Text style={styles.sectionTitle}>
          {CATEGORIES.find((c) => c.value === selectedCategory)?.label ?? "Alimentos"}
        </Text>
        <Text style={styles.foodListCount}>{filteredFoods.length} alimentos</Text>
      </View>

      {filteredFoods.length === 0 ? (
        <View style={styles.foodEmpty}>
          <Text style={{ fontSize: 32, marginBottom: spacing.sm }}>🔍</Text>
          <Text style={styles.foodEmptyText}>No hay alimentos en esta categoría.</Text>
        </View>
      ) : (
        <View>
          {filteredFoods.slice(0, 60).map((f) => (
            <Pressable
              key={f.id}
              style={({ pressed }: { pressed: boolean }) => [styles.foodRow, pressed && styles.foodRowPressed]}
              onPress={() => { setSelectedFood(f); setGrams(f.serving_size); }}
            >
              <Text style={styles.foodRowEmoji}>
                {emojiForFood(f.name, "🍽")}
              </Text>
              <View style={{ flex: 1 }}>
                <View style={styles.foodRowNameRow}>
                  <Text style={styles.foodRowName} numberOfLines={1}>{f.name}</Text>
                  {cookingState(f.name) === "raw" && (
                    <View style={[styles.cookingBadge, { backgroundColor: "rgba(59,130,246,0.18)" }]}>
                      <Text style={[styles.cookingBadgeText, { color: colors.catDairy }]}>Crudo</Text>
                    </View>
                  )}
                  {cookingState(f.name) === "cooked" && (
                    <View style={[styles.cookingBadge, { backgroundColor: "rgba(249,115,22,0.18)" }]}>
                      <Text style={[styles.cookingBadgeText, { color: colors.catDish }]}>Cocido</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.foodRowMeta}>
                  {f.kcal} kcal/100{f.serving_unit === "unidad" ? "un" : f.serving_unit} ·
                  {" "}P {f.protein_g}g · C {f.carbs_g}g · G {f.fat_g}g
                </Text>
              </View>
              <Text style={styles.foodRowCaret}>+</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* === Acciones rápidas === */}
      <Pressable style={styles.addActionBtn} onPress={() => setShowSearch(true)}>
        <Text style={styles.addActionText}>+ Comida</Text>
      </Pressable>

      {/* === Agua === */}
      <View style={styles.card}>
        <View style={styles.waterHeader}>
          <Text style={styles.cardTitle}>Agua</Text>
          <Text style={styles.waterValue}>{water} ml</Text>
        </View>
        <View style={styles.waterBar}>
          <View style={[styles.waterBarFill, { width: `${Math.min(100, (water / targetWater) * 100)}%` }]} />
        </View>
        <Text style={styles.muted}>Objetivo: {targetWater} ml</Text>
        <View style={styles.waterButtons}>
          <Pressable style={styles.waterBtn} onPress={() => addWater(250).then(refresh)}>
            <Text style={styles.waterBtnEmoji}>🥛</Text>
            <Text style={styles.waterBtnText}>+250</Text>
          </Pressable>
          <Pressable style={styles.waterBtn} onPress={() => addWater(500).then(refresh)}>
            <Text style={styles.waterBtnEmoji}>💧</Text>
            <Text style={styles.waterBtnText}>+500</Text>
          </Pressable>
          <Pressable style={[styles.waterBtn, styles.waterBtnL]} onPress={() => addWater(1000).then(refresh)}>
            <Text style={styles.waterBtnEmoji}>🍶</Text>
            <Text style={styles.waterBtnText}>+1L</Text>
          </Pressable>
        </View>
      </View>

      {/* === Suplementos hoy === */}
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

      {/* === Evolución de peso === */}
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

      {/* === Modal: buscador + categorías + escáner === */}
      <Modal visible={showSearch} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowSearch(false)} hitSlop={12}>
              <Text style={styles.closeText}>‹ Cerrar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Añadir comida</Text>
            <Pressable onPress={() => { setShowSearch(false); setShowScanner(true); }} hitSlop={12}>
              <Text style={styles.scannerBtnText}>📷 Escáner</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Ej: pollo, arroz, whey…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={doSearch}
            autoFocus
          />
          {/* Categorías en el buscador */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}
          >
            {CATEGORIES.filter(c => c.value !== "all").map((c) => (
              <Pressable
                key={c.value}
                style={[styles.catChip, styles.catChipSmall]}
                onPress={() => {
                  setSelectedCategory(c.value);
                  setShowSearch(false);
                }}
              >
                <Text style={styles.catChipEmoji}>{c.emoji}</Text>
                <Text style={styles.catChipLabel}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {results.length === 0 && query.length > 0 && (
            <Text style={styles.noResults}>Sin resultados para "{query}"</Text>
          )}
          {query.length === 0 && (
            <Text style={styles.hintText}>Escribe el nombre o filtra por categoría arriba.</Text>
          )}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }: { pressed: boolean }) => [styles.foodItem, pressed && styles.foodItemPressed]}
                onPress={() => { setSelectedFood(item); setShowSearch(false); }}
              >
                <Text style={styles.foodItemEmoji}>{emojiForFood(item.name, "🍽")}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.foodItemName}>{item.name}</Text>
                  <Text style={styles.foodItemMeta}>
                    {item.kcal} kcal · {item.protein_g}P · {item.carbs_g}C · {item.fat_g}F {item.is_supplement ? "· supp" : ""}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* === Modal gramos === */}
      <Modal visible={!!selectedFood} animationType="slide" transparent={true}>
        {selectedFood && (
          <View style={styles.gramsModal}>
            <View style={styles.gramsModalHeader}>
              <Text style={styles.gramsEmoji}>{emojiForFood(selectedFood.name, "🍽")}</Text>
              <Text style={styles.modalTitle}>{selectedFood.name}</Text>
            </View>
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

      {/* === Scanner Modal === */}
      <Modal visible={showScanner} animationType="slide" transparent={false}>
        <BarcodeScannerScreen onClose={() => { setShowScanner(false); refresh(); }} />
      </Modal>
    </ScrollView>
  );
};

// ============================================================================
// Subcomponentes
// ============================================================================
const MacroBar: React.FC<{
  emoji: string; label: string; value: number; target: number;
  unit: string; color: string;
}> = ({ emoji, label, value, target, unit, color }) => {
  const pct = Math.min(100, (value / Math.max(1, target)) * 100);
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>
          <Text style={{ fontSize: 13 }}>{emoji} </Text>
          {label}
        </Text>
        <Text style={styles.macroValue}>{Math.round(value)} / {target} {unit}</Text>
      </View>
      <View style={styles.macroBar}>
        <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

const ObjectiveStat: React.FC<{
  label: string; emoji: string; value: number; target: number; unit: string; color: string;
}> = ({ emoji, label, value, target, unit, color }) => {
  const remaining = Math.max(0, Math.round(target - value));
  return (
    <View style={styles.objectiveStat}>
      <Text style={styles.objectiveStatEmoji}>{emoji}</Text>
      <Text style={styles.objectiveStatLabel}>{label}</Text>
      <Text style={[styles.objectiveStatValue, { color }]}>
        {value}<Text style={styles.objectiveStatDivider}> / {target} {unit}</Text>
      </Text>
      <Text style={styles.objectiveStatRemain}>Faltan {remaining} {unit}</Text>
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

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },

  // Macros card
  macrosCard: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim
  },
  macrosHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md },
  macrosKcal: { color: colors.accent, fontSize: 18, fontWeight: "900" },
  macroRow: { marginBottom: spacing.sm },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  macroLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  macroValue: { color: colors.bright, fontSize: 12, fontWeight: "700" },
  macroBar: { height: 8, backgroundColor: colors.dim, borderRadius: 4, overflow: "hidden" },
  macroBarFill: { height: "100%", borderRadius: 4 },

  // Objetivo hoy card
  objectiveCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.accent
  },
  objectiveGrid: { flexDirection: "row", gap: spacing.sm },
  objectiveStat: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.md },
  objectiveStatEmoji: { fontSize: 22 },
  objectiveStatLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  objectiveStatValue: { fontSize: 22, fontWeight: "900", marginTop: 4 },
  objectiveStatDivider: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  objectiveStatRemain: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 4 },
  objectiveHint: { color: colors.textMuted, fontSize: 11, marginTop: spacing.md, textAlign: "center", lineHeight: 16 },

  // Chips
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.dim
  },
  catChipSmall: { paddingVertical: 6 },
  catChipEmoji: { fontSize: 14 },
  catChipLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  catChipLabelActive: { color: colors.bg, fontWeight: "900" },

  // Lista de alimentos
  foodListHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  foodListCount: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  foodEmpty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dim },
  foodEmptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  foodRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginBottom: 6, borderWidth: 1, borderColor: colors.dim
  },
  foodRowPressed: { backgroundColor: colors.surfaceElevated },
  foodRowEmoji: { fontSize: 28 },
  foodRowNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  foodRowName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  cookingBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  cookingBadgeText: { fontSize: 10, fontWeight: "800" },
  foodRowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  foodRowCaret: { color: colors.accent, fontSize: 22, fontWeight: "900" },

  // Acciones rápidas
  addActionBtn: {
    backgroundColor: colors.accent, paddingVertical: spacing.md + 2,
    borderRadius: radius.lg, alignItems: "center", marginVertical: spacing.lg
  },
  addActionText: { color: colors.bg, fontWeight: "900", fontSize: 15 },

  // Agua
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  waterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  waterValue: { color: colors.concentric, fontSize: 22, fontWeight: "900" },
  waterBar: { height: 12, backgroundColor: colors.dim, borderRadius: 6, overflow: "hidden", marginVertical: spacing.sm },
  waterBarFill: { height: "100%", backgroundColor: colors.concentric, borderRadius: 6 },
  muted: { color: colors.textMuted, fontSize: 12 },
  waterButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  waterBtn: {
    flex: 1, backgroundColor: "rgba(6,182,212,0.12)", paddingVertical: spacing.md,
    borderRadius: radius.md, alignItems: "center", gap: 4, minHeight: 64, justifyContent: "center"
  },
  waterBtnL: { backgroundColor: "rgba(6,182,212,0.20)" },
  waterBtnEmoji: { fontSize: 18 },
  waterBtnText: { color: colors.concentric, fontWeight: "900", fontSize: 14 },

  // Suplementos
  suppRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  suppName: { color: colors.bright, fontSize: 14 },
  suppDose: { color: colors.textMuted, fontSize: 14 },

  // Peso
  weightRange: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  sparklineContainer: { height: 80, marginTop: spacing.sm },
  sparkline: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  sparkBar: { flex: 1, backgroundColor: colors.accent, borderRadius: 1, minHeight: 4 },

  // Modales
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { color: colors.bright, fontSize: 20, fontWeight: "800" },
  closeText: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  scannerBtnText: { color: colors.accent, fontWeight: "800", fontSize: 14 },
  input: {
    backgroundColor: colors.surface, color: colors.bright, fontSize: 16,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.md
  },
  noResults: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl, fontSize: 14 },
  hintText: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg, fontSize: 13 },
  foodItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.dim
  },
  foodItemPressed: { backgroundColor: colors.surfaceElevated },
  foodItemEmoji: { fontSize: 24 },
  foodItemName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  foodItemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  // Gramos modal
  gramsModal: {
    backgroundColor: colors.surfaceElevated, margin: spacing.lg, borderRadius: radius.lg,
    padding: spacing.lg, marginTop: "25%", borderWidth: 1, borderColor: colors.accent
  },
  gramsModalHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  gramsEmoji: { fontSize: 32 },
  foodMeta: { color: colors.textMuted, fontSize: 12 },
  gramsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: spacing.md },
  stepBtn: {
    backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderRadius: radius.md, minWidth: 70, alignItems: "center",
    minHeight: 56
  },
  stepBtnText: { color: colors.bright, fontWeight: "800", fontSize: 14 },
  gramsValue: { color: colors.bright, fontSize: 26, fontWeight: "800" },
  calcPreview: { color: colors.ok, fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  cancelText: { color: colors.bright, fontWeight: "700" },
  confirmBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  confirmText: { color: colors.bg, fontWeight: "800" }
});
