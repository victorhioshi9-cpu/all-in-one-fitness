/**
 * foodRepo.ts - Persistencia de alimentos y log de nutrición.
 *   - Inserta los alimentos precargados si no existen.
 *   - Busca por nombre (LIKE).
 *   - Registra comidas en `nutrition_logs` calculando macros por gramo.
 *   - Suma macros diarios.
 */
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";
import { PRELOAD_FOODS, PRELOAD_COMBOS, type FoodTemplate } from "./foodTemplates";
import { toLocalISO } from "@/modules/intelligence/dateUtils";

export interface FoodRow {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  serving_unit: "g" | "ml" | "unidad";
  serving_size: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  is_supplement: number;
  is_combo: number;
  combo_items?: string | null;
}

const uid = () => `food_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Inserta los alimentos precargados (idempotente). */
export async function ensurePreloadedFoods(): Promise<void> {
  const db = await openDatabase();
  const { queryAsync: q } = await import("@/modules/persistence/db");
  const existing = await q<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM foods WHERE source = 'precargado'", []);
  if (existing[0]?.cnt > 0) return;

  const now = Date.now();
  for (const f of PRELOAD_FOODS) {
    const id = uid();
    await execAsync(
      db,
      `INSERT OR IGNORE INTO foods
        (id, name, brand, barcode, serving_unit, serving_size,
         kcal, protein_g, carbs_g, fat_g, fiber_g, is_supplement,
         source, is_combo, combo_items, created_at, updated_at, synced_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'precargado', 0, NULL, ?, ?, NULL)`,
      [id, f.name, f.serving_unit, f.serving_size,
       f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g ?? 0, f.is_supplement ? 1 : 0,
       now, now]
    );
  }

  // Combos
  for (const combo of PRELOAD_COMBOS) {
    // Resolver food_id de cada item por name
    const items: Array<{ food_id: string; grams: number }> = [];
    for (const item of combo.items) {
      const found = await q<{ id: string }>(db, "SELECT id FROM foods WHERE name = ? LIMIT 1", [item.name]);
      if (found[0]) items.push({ food_id: found[0].id, grams: item.grams });
    }
    const comboId = uid();
    await execAsync(
      db,
      `INSERT OR IGNORE INTO foods
        (id, name, brand, barcode, serving_unit, serving_size,
         kcal, protein_g, carbs_g, fat_g, fiber_g, is_supplement,
         source, is_combo, combo_items, created_at, updated_at, synced_at)
       VALUES (?, ?, NULL, NULL, 'unidad', 1, 0, 0, 0, 0, 0, 0, 'precargado', 1, ?, ?, ?, NULL)`,
      [comboId, combo.name, JSON.stringify(items), now, now]
    );
  }
}

export async function searchFoods(query: string): Promise<FoodRow[]> {
  const db = await openDatabase();
  return queryAsync<FoodRow>(
    db,
    `SELECT * FROM foods WHERE name LIKE ? ORDER BY is_supplement ASC, name ASC LIMIT 50`,
    [`%${query}%`]
  );
}

export async function getAllFoods(): Promise<FoodRow[]> {
  const db = await openDatabase();
  return queryAsync<FoodRow>(db, "SELECT * FROM foods ORDER BY name ASC", []);
}

export async function getFoodById(id: string): Promise<FoodRow | null> {
  const db = await openDatabase();
  const rows = await queryAsync<FoodRow>(db, "SELECT * FROM foods WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export interface FoodLogInput {
  foodId: string;
  grams: number;        // cantidad consumida en g/ml/unidades
  mealName?: string;    // 'desayuno' | 'almuerzo' | 'cena' | 'snack'
}

export interface FoodLogResult {
  id: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/** Registra una comida en nutrition_logs calculando los macros por gramo. */
export async function logFood(input: FoodLogInput): Promise<FoodLogResult> {
  const db = await openDatabase();
  const food = await getFoodById(input.foodId);
  if (!food) throw new Error("Food not found: " + input.foodId);

  // Si es combo, expandir items
  if (food.is_combo) {
    const items: Array<{ food_id: string; grams: number }> = food.combo_items ? JSON.parse(food.combo_items) : [];
    let total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
    for (const item of items) {
      const sub = await logFood({ foodId: item.food_id, grams: item.grams, mealName: input.mealName });
      total.kcal += sub.kcal;
      total.protein_g += sub.protein_g;
      total.carbs_g += sub.carbs_g;
      total.fat_g += sub.fat_g;
      total.fiber_g += sub.fiber_g;
    }
    return { id: "combo", ...total };
  }

  // Calcular macros por factor (por 100g o por unidad)
  const factor = food.serving_unit === "unidad"
    ? input.grams  // cantidad = número de unidades
    : input.grams / 100;  // cantidad en gramos / 100

  const kcal = food.kcal * factor;
  const protein_g = food.protein_g * factor;
  const carbs_g = food.carbs_g * factor;
  const fat_g = food.fat_g * factor;
  const fiber_g = food.fiber_g * factor;

  const id = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const today = toLocalISO(new Date());
  await execAsync(
    db,
    `INSERT INTO nutrition_logs
      (id, day, meal_name, kcal, protein_g, carbs_g, fat_g, fiber_g,
       is_supplement, logged_at, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, today, input.mealName ?? null, kcal, protein_g, carbs_g, fat_g, fiber_g,
     food.is_supplement, now, now, now]
  );

  return { id, kcal, protein_g, carbs_g, fat_g, fiber_g };
}

/** Macros diarios agregados. */
export async function getDailyMacros(dayIso?: string): Promise<{
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
  entries: any[];
}> {
  const day = dayIso ?? toLocalISO(new Date());
  const db = await openDatabase();
  const rows = await queryAsync<any>(
    db,
    `SELECT * FROM nutrition_logs WHERE day = ? ORDER BY logged_at ASC`,
    [day]
  );
  const total = rows.reduce((acc: any, r: any) => ({
    kcal: acc.kcal + r.kcal,
    protein_g: acc.protein_g + r.protein_g,
    carbs_g: acc.carbs_g + r.carbs_g,
    fat_g: acc.fat_g + r.fat_g,
    fiber_g: (acc.fiber_g ?? 0) + (r.fiber_g ?? 0)
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  return { ...total, entries: rows };
}

/** Agua diaria. */
export async function addWater(ml: number): Promise<void> {
  const db = await openDatabase();
  const id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const today = toLocalISO(new Date());
  await execAsync(
    db,
    `INSERT INTO hydration_logs (id, day, ml, logged_at, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, today, ml, now, now, now]
  );
}

export async function getDailyWater(dayIso?: string): Promise<number> {
  const day = dayIso ?? toLocalISO(new Date());
  const db = await openDatabase();
  const rows = await queryAsync<{ total: number | null }>(
    db,
    "SELECT COALESCE(SUM(ml), 0) as total FROM hydration_logs WHERE day = ?",
    [day]
  );
  return rows[0]?.total ?? 0;
}

/** Suplementos diarios. */
export async function getDailySupplements(dayIso?: string): Promise<any[]> {
  const day = dayIso ?? toLocalISO(new Date());
  const db = await openDatabase();
  return queryAsync<any>(
    db,
    "SELECT * FROM supplement_logs WHERE day = ? ORDER BY taken_at ASC",
    [day]
  );
}
