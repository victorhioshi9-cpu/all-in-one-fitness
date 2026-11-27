/**
 * openFoodFactsClient.ts
 * ----------------------------------------------------------------------------
 * Cliente de la API pública de Open Food Facts.
 * - Gratuita, sin API key.
 * - Busca producto por barcode (EAN-13).
 * - Cachea el resultado en SQLite (tabla foods) para no volver a llamar.
 *
 * URL: https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 */
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

export interface OffProduct {
  barcode: string;
  name: string;
  brand?: string;
  serving_size?: string;
  // Por 100g
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
}

/**
 * Busca un producto por barcode:
 *   1) Mira en SQLite (cache local).
 *   2) Si no está, llama a OFF.
 *   3) Guarda en SQLite y devuelve.
 */
export async function findFoodByBarcode(barcode: string): Promise<OffProduct | null> {
  // 1) Cache
  const cached = await getFoodByBarcodeFromCache(barcode);
  if (cached) return cached;

  // 2) OFF API
  try {
    const url = `${OFF_API}/${barcode}.json?fields=product_name,brands,serving_size,nutriments`;
    const response = await fetch(url, {
      headers: { "User-Agent": "AllInOneFitness/0.3.0 (android)" }
    });
    if (!response.ok) return null;
    const json = await response.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments || {};
    const product: OffProduct = {
      barcode,
      name: p.product_name ?? "Producto desconocido",
      brand: p.brands,
      serving_size: p.serving_size,
      kcal: Math.round(Number(n["energy-kcal_100g"] ?? n["energy_100g"] / 4.184 ?? 0)),
      protein_g: Number(n.proteins_100g ?? 0),
      carbs_g: Number(n.carbohydrates_100g ?? 0),
      fat_g: Number(n.fat_100g ?? 0),
      fiber_g: Number(n.fiber_100g ?? 0)
    };

    // 3) Guardar en cache
    await cacheFood(product);
    return product;
  } catch (err) {
    console.warn("[OFF] lookup failed:", err);
    return null;
  }
}

async function getFoodByBarcodeFromCache(barcode: string): Promise<OffProduct | null> {
  try {
    const db = await openDatabase();
    const rows = await queryAsync<any>(
      db,
      "SELECT * FROM foods WHERE barcode = ? LIMIT 1",
      [barcode]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      barcode: r.barcode,
      name: r.name,
      brand: r.brand,
      serving_size: `${r.serving_size}${r.serving_unit}`,
      kcal: r.kcal,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      fiber_g: r.fiber_g
    };
  } catch {
    return null;
  }
}

async function cacheFood(p: OffProduct): Promise<void> {
  try {
    const db = await openDatabase();
    const id = `food_${p.barcode}_${Date.now().toString(36)}`;
    const now = Date.now();
    await execAsync(
      db,
      `INSERT OR REPLACE INTO foods
        (id, name, brand, barcode, serving_unit, serving_size,
         kcal, protein_g, carbs_g, fat_g, fiber_g, is_supplement,
         source, is_combo, combo_items, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, 'g', 100, ?, ?, ?, ?, ?, 0, 'openfoodfacts', 0, NULL, ?, ?, NULL)`,
      [id, p.name, p.brand ?? null, p.barcode,
       p.kcal, p.protein_g, p.carbs_g, p.fat_g, p.fiber_g ?? 0,
       now, now]
    );
  } catch (err) {
    console.warn("[OFF] cache failed:", err);
  }
}
