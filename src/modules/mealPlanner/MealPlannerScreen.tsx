/**
 * MealPlannerScreen.tsx
 * ----------------------------------------------------------------------------
 * Planificador semanal de comidas + lista de compras.
 *
 *   - Vista: 7 columnas (lunes-domingo) x 4 comidas (desayuno/almuerzo/cena/snack).
 *   - Al pulsar una celda: selector de food (combos + alimentos).
 *   - Botón "Generar lista de compras": agrega todos los alimentos del plan
 *     a shopping_list_items agrupados por food_id (sumando gramos).
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal, FlatList, TextInput
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";
import { ensurePreloadedFoods, searchFoods, type FoodRow } from "@/modules/nutrition/foodRepo";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MEALS = ["desayuno", "almuerzo", "cena", "snack"];

export const MealPlannerScreen: React.FC = () => {
  const [plan, setPlan] = useState<Record<string, any>>({});  // key: dayIdx_mealIdx -> { food_id, name, grams }
  const [editing, setEditing] = useState<{ dayIdx: number; mealIdx: number } | null>(null);
  const [showFoodPicker, setShowFoodPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodRow[]>([]);
  const [shoppingList, setShoppingList] = useState<any[]>([]);

  const loadPlan = useCallback(async () => {
    await ensurePreloadedFoods();
    const db = await openDatabase();
    const rows = await queryAsync<any>(db, "SELECT * FROM weekly_meal_plan", []);
    const map: Record<string, any> = {};
    for (const r of rows) {
      const food = await queryAsync<{ name: string }>(db, "SELECT name FROM foods WHERE id = ?", [r.food_id]);
      map[`${r.day_of_week}_${r.meal_name}`] = {
        planId: r.id,
        foodId: r.food_id,
        name: food[0]?.name ?? "?",
        grams: r.grams
      };
    }
    setPlan(map);
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  async function pickFood(food: FoodRow) {
    if (!editing) return;
    const key = `${editing.dayIdx + 1}_${MEALS[editing.mealIdx]}`;
    const db = await openDatabase();
    // Upsert
    const existing = plan[key];
    if (existing?.planId) {
      await execAsync(db, "UPDATE weekly_meal_plan SET food_id = ?, grams = ?, updated_at = ? WHERE id = ?", [food.id, 100, Date.now(), existing.planId]);
    } else {
      const id = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await execAsync(
        db,
        `INSERT OR REPLACE INTO weekly_meal_plan (id, day_of_week, meal_name, food_id, grams, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, 100, ?, ?, NULL)`,
        [id, editing.dayIdx + 1, MEALS[editing.mealIdx], food.id, Date.now(), Date.now()]
      );
    }
    setShowFoodPicker(false);
    setEditing(null);
    loadPlan();
  }

  async function generateShoppingList() {
    const db = await openDatabase();
    // Limpiar lista previa
    await execAsync(db, "DELETE FROM shopping_list_items", []);
    // Agrupar por food_id sumando gramos (comida x 7 días)
    const rows = await queryAsync<{ food_id: string; name: string; total_grams: number }>(
      db,
      `SELECT wmp.food_id, f.name as name, SUM(wmp.grams) as total_grams
       FROM weekly_meal_plan wmp JOIN foods f ON f.id = wmp.food_id
       GROUP BY wmp.food_id`,
      []
    );
    for (const r of rows) {
      const id = `shop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await execAsync(
        db,
        `INSERT INTO shopping_list_items (id, name, grams, unit, status, added_at, purchased_at)
         VALUES (?, ?, ?, 'g', 'pending', ?, NULL)`,
        [id, r.name, r.total_grams, Date.now()]
      );
    }
    // Recargar
    const list = await queryAsync<any>(db, "SELECT * FROM shopping_list_items ORDER BY name", []);
    setShoppingList(list);
  }

  async function togglePurchased(item: any) {
    const db = await openDatabase();
    const newStatus = item.status === "pending" ? "purchased" : "pending";
    await execAsync(
      db,
      "UPDATE shopping_list_items SET status = ?, purchased_at = ? WHERE id = ?",
      [newStatus, newStatus === "purchased" ? Date.now() : null, item.id]
    );
    const list = await queryAsync<any>(db, "SELECT * FROM shopping_list_items ORDER BY name", []);
    setShoppingList(list);
  }

  async function doSearch(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setResults(await searchFoods(q));
  }

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.container}>
        <Text style={styles.title}>Plan semanal de comidas</Text>

        {/* Tabla 7x4 */}
        <View style={styles.tableHeader}>
          <View style={styles.firstCol} />
          {DAYS.map((d, i) => <Text key={i} style={styles.dayHeader}>{d}</Text>)}
        </View>
        {MEALS.map((meal, mi) => (
          <View key={mi} style={styles.tableRow}>
            <View style={styles.firstCol}><Text style={styles.mealLabel}>{meal}</Text></View>
            {DAYS.map((_, di) => {
              const cell = plan[`${di + 1}_${meal}`];
              return (
                <Pressable
                  key={di}
                  style={[styles.cell, cell && styles.cellFilled]}
                  onPress={() => { setEditing({ dayIdx: di, mealIdx: mi }); setShowFoodPicker(true); }}
                >
                  {cell ? (
                    <>
                      <Text style={styles.cellName} numberOfLines={1}>{cell.name}</Text>
                      <Text style={styles.cellGrams}>{cell.grams}g</Text>
                    </>
                  ) : (
                    <Text style={styles.cellPlus}>+</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        <Pressable style={styles.shoppingBtn} onPress={generateShoppingList}>
          <Text style={styles.shoppingBtnText}>Generar lista de compras</Text>
        </Pressable>

        {/* Lista de compras */}
        {shoppingList.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.cardTitle}>Lista de compras</Text>
            {shoppingList.map(item => (
              <Pressable
                key={item.id}
                style={[styles.shopRow, item.status === "purchased" && styles.shopRowDone]}
                onPress={() => togglePurchased(item)}
              >
                <Text style={[styles.shopName, item.status === "purchased" && styles.shopNameDone]}>
                  {item.status === "purchased" ? "✓" : "○"} {item.name}
                </Text>
                <Text style={styles.shopGrams}>{Math.round(item.grams)}g</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Modal selector de alimento */}
      <Modal visible={showFoodPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Elegir alimento</Text>
          <TextInput
            style={styles.input}
            placeholder="Buscar alimento o combo…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={doSearch}
            autoFocus
          />
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.foodItem} onPress={() => pickFood(item)}>
                <Text style={styles.foodName}>{item.name}</Text>
                <Text style={styles.foodMeta}>
                  {item.kcal} kcal · {item.protein_g}P · {item.is_combo ? "combo" : "single"}
                </Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.closeModalBtn} onPress={() => setShowFoodPicker(false)}>
            <Text style={styles.closeModalText}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  tableHeader: { flexDirection: "row" },
  firstCol: { width: 80, justifyContent: "center" },
  dayHeader: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "800", paddingVertical: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  mealLabel: { color: colors.bright, fontSize: 11, fontWeight: "700" },
  cell: { flex: 1, minHeight: 50, marginHorizontal: 1, backgroundColor: colors.bgCard, borderRadius: 4, borderWidth: 1, borderColor: colors.dim, alignItems: "center", justifyContent: "center" },
  cellFilled: { borderColor: colors.accent, backgroundColor: "rgba(255,107,53,0.08)" },
  cellName: { color: colors.bright, fontSize: 9, fontWeight: "700" },
  cellGrams: { color: colors.textMuted, fontSize: 9 },
  cellPlus: { color: colors.textMuted, fontSize: 18, fontWeight: "800" },
  shoppingBtn: { backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  shoppingBtnText: { color: "#08080c", fontWeight: "800", fontSize: 14 },
  listCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", marginBottom: spacing.sm },
  shopRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.dim },
  shopRowDone: { opacity: 0.6 },
  shopName: { color: colors.bright, fontSize: 14 },
  shopNameDone: { textDecorationLine: "line-through" },
  shopGrams: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalTitle: { color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  input: { backgroundColor: colors.bgCard, color: colors.bright, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.md },
  foodItem: { backgroundColor: colors.bgCard, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.dim },
  foodName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  foodMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  closeModalBtn: { backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  closeModalText: { color: colors.bright, fontWeight: "700" }
});
