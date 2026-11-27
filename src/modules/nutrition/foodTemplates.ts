/**
 * foodTemplates.ts
 * ----------------------------------------------------------------------------
 * Base precargada de alimentos comunes calculables por gramo o porción.
 * Todos los valores están por 100 g/ml (salvo unidades sueltas).
 *
 * Versión mejorada:
 *   - Cada proteína tiene variantes crudo/cocido para que el usuario elija
 *     cómo lo prepara.
 *   - Más alimentos latinos (Perú): lomo saltado, ceviche, ají de gallina,
 *     quinoa, kiwicha, tarwi, chía, maca.
 *   - Más suplementos y bebidas.
 */
export interface FoodTemplate {
  name: string;
  brand?: string;
  serving_unit: "g" | "ml" | "unidad";
  serving_size: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  is_supplement?: boolean;
}

export const PRELOAD_FOODS: FoodTemplate[] = [
  // --- Proteínas: variantes crudo y cocido ---
  { name: "Pechuga de pollo cruda", serving_unit: "g", serving_size: 150, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 },
  { name: "Pechuga de pollo cocida", serving_unit: "g", serving_size: 150, kcal: 195, protein_g: 38, carbs_g: 0, fat_g: 4.5, fiber_g: 0 },
  { name: "Carne magra de res cruda", serving_unit: "g", serving_size: 150, kcal: 250, protein_g: 26, carbs_g: 0, fat_g: 17, fiber_g: 0 },
  { name: "Carne magra de res cocida", serving_unit: "g", serving_size: 150, kcal: 290, protein_g: 30, carbs_g: 0, fat_g: 20, fiber_g: 0 },
  { name: "Salmón crudo", serving_unit: "g", serving_size: 150, kcal: 208, protein_g: 20, carbs_g: 0, fat_g: 13, fiber_g: 0 },
  { name: "Salmón cocido", serving_unit: "g", serving_size: 150, kcal: 230, protein_g: 25, carbs_g: 0, fat_g: 14, fiber_g: 0 },
  { name: "Atún en agua (lata)", serving_unit: "g", serving_size: 100, kcal: 116, protein_g: 26, carbs_g: 0, fat_g: 1, fiber_g: 0 },
  { name: "Huevo entero crudo", serving_unit: "unidad", serving_size: 1, kcal: 78, protein_g: 6, carbs_g: 0.6, fat_g: 5, fiber_g: 0 },
  { name: "Huevo entero cocido", serving_unit: "unidad", serving_size: 1, kcal: 80, protein_g: 6.3, carbs_g: 0.6, fat_g: 5.3, fiber_g: 0 },
  { name: "Clara de huevo", serving_unit: "unidad", serving_size: 1, kcal: 17, protein_g: 3.6, carbs_g: 0.2, fat_g: 0, fiber_g: 0 },
  { name: "Merluza cruda", serving_unit: "g", serving_size: 150, kcal: 90, protein_g: 18, carbs_g: 0, fat_g: 1.5, fiber_g: 0 },
  { name: "Merluza cocida", serving_unit: "g", serving_size: 150, kcal: 110, protein_g: 22, carbs_g: 0, fat_g: 1.8, fiber_g: 0 },
  { name: "Pechuga de pavo cruda", serving_unit: "g", serving_size: 120, kcal: 105, protein_g: 24, carbs_g: 0.5, fat_g: 1.5, fiber_g: 0 },
  { name: "Pechuga de pavo cocida", serving_unit: "g", serving_size: 120, kcal: 130, protein_g: 28, carbs_g: 0.5, fat_g: 1.8, fiber_g: 0 },
  { name: "Tofu firme crudo", serving_unit: "g", serving_size: 100, kcal: 144, protein_g: 17, carbs_g: 3, fat_g: 9, fiber_g: 2 },
  { name: "Tofu firme cocido", serving_unit: "g", serving_size: 100, kcal: 165, protein_g: 19, carbs_g: 3, fat_g: 10, fiber_g: 2 },
  { name: "Garbanzos cocidos", serving_unit: "g", serving_size: 100, kcal: 164, protein_g: 9, carbs_g: 27, fat_g: 2.5, fiber_g: 8 },
  { name: "Lentejas cocidas", serving_unit: "g", serving_size: 100, kcal: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4, fiber_g: 8 },
  { name: "Frijoles negros cocidos", serving_unit: "g", serving_size: 100, kcal: 132, protein_g: 8.9, carbs_g: 24, fat_g: 0.5, fiber_g: 8.7 },

  // --- Carbohidratos ---
  { name: "Arroz blanco cocido", serving_unit: "g", serving_size: 100, kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4 },
  { name: "Arroz integral cocido", serving_unit: "g", serving_size: 100, kcal: 112, protein_g: 2.6, carbs_g: 23, fat_g: 0.9, fiber_g: 1.8 },
  { name: "Papa sancochada", serving_unit: "g", serving_size: 150, kcal: 87, protein_g: 1.9, carbs_g: 20, fat_g: 0.1, fiber_g: 1.8 },
  { name: "Papa frita", serving_unit: "g", serving_size: 100, kcal: 312, protein_g: 3.4, carbs_g: 41, fat_g: 15, fiber_g: 2.8 },
  { name: "Camote cocido", serving_unit: "g", serving_size: 150, kcal: 90, protein_g: 2, carbs_g: 21, fat_g: 0.1, fiber_g: 3 },
  { name: "Avena cruda", serving_unit: "g", serving_size: 50, kcal: 389, protein_g: 13, carbs_g: 66, fat_g: 7, fiber_g: 10 },
  { name: "Avena cocida", serving_unit: "g", serving_size: 200, kcal: 154, protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4 },
  { name: "Pan integral", serving_unit: "g", serving_size: 50, kcal: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4, fiber_g: 7 },
  { name: "Pan blanco", serving_unit: "g", serving_size: 50, kcal: 265, protein_g: 9, carbs_g: 49, fat_g: 3.2, fiber_g: 2.7 },
  { name: "Pasta cocida", serving_unit: "g", serving_size: 100, kcal: 131, protein_g: 5, carbs_g: 25, fat_g: 1.1, fiber_g: 1.8 },
  { name: "Quinoa cocida", serving_unit: "g", serving_size: 100, kcal: 120, protein_g: 4.4, carbs_g: 21, fat_g: 1.9, fiber_g: 2.8 },
  { name: "Plátano", serving_unit: "unidad", serving_size: 1, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, fiber_g: 2.6 },
  { name: "Manzana", serving_unit: "unidad", serving_size: 1, kcal: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, fiber_g: 2.4 },
  { name: "Arroz chaufa", serving_unit: "g", serving_size: 250, kcal: 180, protein_g: 6, carbs_g: 25, fat_g: 6, fiber_g: 1 },
  { name: "Yuca cocida", serving_unit: "g", serving_size: 150, kcal: 160, protein_g: 0.6, carbs_g: 38, fat_g: 0.3, fiber_g: 2 },

  // --- Lácteos ---
  { name: "Yogur griego natural", serving_unit: "g", serving_size: 150, kcal: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4, fiber_g: 0 },
  { name: "Yogur griego 0%", serving_unit: "g", serving_size: 150, kcal: 56, protein_g: 10, carbs_g: 4, fat_g: 0.2, fiber_g: 0 },
  { name: "Leche desnatada", serving_unit: "ml", serving_size: 200, kcal: 34, protein_g: 3.4, carbs_g: 5, fat_g: 0.1, fiber_g: 0 },
  { name: "Leche entera", serving_unit: "ml", serving_size: 200, kcal: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, fiber_g: 0 },
  { name: "Leche evaporada", serving_unit: "ml", serving_size: 100, kcal: 134, protein_g: 7, carbs_g: 10, fat_g: 7.5, fiber_g: 0 },
  { name: "Queso fresco", serving_unit: "g", serving_size: 60, kcal: 98, protein_g: 11, carbs_g: 3, fat_g: 4.5, fiber_g: 0 },
  { name: "Cottage cheese", serving_unit: "g", serving_size: 100, kcal: 98, protein_g: 11, carbs_g: 3.4, fat_g: 4.3, fiber_g: 0 },
  { name: "Queso mozzarella", serving_unit: "g", serving_size: 30, kcal: 280, protein_g: 18, carbs_g: 3.1, fat_g: 22, fiber_g: 0 },

  // --- Grasas saludables ---
  { name: "Almendras", serving_unit: "g", serving_size: 30, kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 49, fiber_g: 12 },
  { name: "Maní/cacahuate", serving_unit: "g", serving_size: 30, kcal: 567, protein_g: 26, carbs_g: 16, fat_g: 49, fiber_g: 8.5 },
  { name: "Nueces", serving_unit: "g", serving_size: 30, kcal: 654, protein_g: 15, carbs_g: 14, fat_g: 65, fiber_g: 6.7 },
  { name: "Aceite de oliva", serving_unit: "ml", serving_size: 10, kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0 },
  { name: "Palta/aguacate", serving_unit: "g", serving_size: 50, kcal: 160, protein_g: 2, carbs_g: 9, fat_g: 15, fiber_g: 7 },
  { name: "Mantequilla de maní", serving_unit: "g", serving_size: 20, kcal: 588, protein_g: 25, carbs_g: 20, fat_g: 50, fiber_g: 6 },
  { name: "Semillas de chía", serving_unit: "g", serving_size: 15, kcal: 486, protein_g: 17, carbs_g: 42, fat_g: 31, fiber_g: 34 },

  // --- Suplementos ---
  { name: "Whey protein concentrate", serving_unit: "g", serving_size: 30, kcal: 400, protein_g: 80, carbs_g: 8, fat_g: 7, fiber_g: 0, is_supplement: true },
  { name: "Whey protein isolate", serving_unit: "g", serving_size: 30, kcal: 380, protein_g: 90, carbs_g: 1, fat_g: 1.5, fiber_g: 0, is_supplement: true },
  { name: "Creatina monohidrato", serving_unit: "g", serving_size: 5, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, is_supplement: true },
  { name: "Cafeína (anhydrous)", serving_unit: "g", serving_size: 0.2, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, is_supplement: true },
  { name: "BCAA 2:1:1", serving_unit: "g", serving_size: 5, kcal: 0, protein_g: 5, carbs_g: 0, fat_g: 0, fiber_g: 0, is_supplement: true },
  { name: "Maltodextrina", serving_unit: "g", serving_size: 30, kcal: 380, protein_g: 0, carbs_g: 95, fat_g: 0, fiber_g: 0, is_supplement: true },
  { name: "Maca en polvo", serving_unit: "g", serving_size: 10, kcal: 325, protein_g: 14, carbs_g: 64, fat_g: 2, fiber_g: 18, is_supplement: true },

  // --- Vegetales ---
  { name: "Brócoli", serving_unit: "g", serving_size: 100, kcal: 34, protein_g: 2.8, carbs_g: 7, fat_g: 0.4, fiber_g: 2.6 },
  { name: "Espinaca cruda", serving_unit: "g", serving_size: 50, kcal: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, fiber_g: 2.2 },
  { name: "Espinaca cocida", serving_unit: "g", serving_size: 100, kcal: 23, protein_g: 3, carbs_g: 3.8, fat_g: 0.3, fiber_g: 2.4 },
  { name: "Tomate", serving_unit: "g", serving_size: 100, kcal: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, fiber_g: 1.2 },
  { name: "Zanahoria cruda", serving_unit: "g", serving_size: 80, kcal: 41, protein_g: 0.9, carbs_g: 10, fat_g: 0.2, fiber_g: 2.8 },
  { name: "Lechuga", serving_unit: "g", serving_size: 50, kcal: 15, protein_g: 1.4, carbs_g: 2.9, fat_g: 0.2, fiber_g: 1.3 },
  { name: "Cebolla cruda", serving_unit: "g", serving_size: 80, kcal: 40, protein_g: 1.1, carbs_g: 9, fat_g: 0.1, fiber_g: 1.7 },
  { name: "Pimiento", serving_unit: "g", serving_size: 100, kcal: 31, protein_g: 1, carbs_g: 6, fat_g: 0.3, fiber_g: 2.1 },
  { name: "Calabacín", serving_unit: "g", serving_size: 100, kcal: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, fiber_g: 1 },

  // --- Frutas adicionales ---
  { name: "Fresas", serving_unit: "g", serving_size: 100, kcal: 32, protein_g: 0.7, carbs_g: 7.7, fat_g: 0.3, fiber_g: 2 },
  { name: "Arándanos", serving_unit: "g", serving_size: 100, kcal: 57, protein_g: 0.7, carbs_g: 14, fat_g: 0.3, fiber_g: 2.4 },
  { name: "Papaya", serving_unit: "g", serving_size: 100, kcal: 43, protein_g: 0.5, carbs_g: 11, fat_g: 0.1, fiber_g: 1.7 },
  { name: "Mango", serving_unit: "g", serving_size: 100, kcal: 60, protein_g: 0.8, carbs_g: 15, fat_g: 0.4, fiber_g: 1.6 },

  // --- Bebidas ---
  { name: "Café negro", serving_unit: "ml", serving_size: 200, kcal: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  { name: "Té verde", serving_unit: "ml", serving_size: 200, kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  { name: "Gatorade", serving_unit: "ml", serving_size: 500, kcal: 80, protein_g: 0, carbs_g: 21, fat_g: 0, fiber_g: 0 },
  { name: "Cerveza", serving_unit: "ml", serving_size: 330, kcal: 43, protein_g: 0.5, carbs_g: 3.6, fat_g: 0, fiber_g: 0 },

  // --- Platillos latinoamericanos ---
  { name: "Ceviche de pescado", serving_unit: "g", serving_size: 200, kcal: 120, protein_g: 18, carbs_g: 5, fat_g: 3, fiber_g: 1 },
  { name: "Lomo saltado", serving_unit: "g", serving_size: 300, kcal: 220, protein_g: 22, carbs_g: 18, fat_g: 9, fiber_g: 2 },
  { name: "Ají de gallina", serving_unit: "g", serving_size: 250, kcal: 195, protein_g: 14, carbs_g: 8, fat_g: 12, fiber_g: 1 },
  { name: "Causa limeña", serving_unit: "g", serving_size: 200, kcal: 215, protein_g: 9, carbs_g: 28, fat_g: 8, fiber_g: 2 },
  { name: "Tallarín rojo", serving_unit: "g", serving_size: 250, kcal: 175, protein_g: 12, carbs_g: 22, fat_g: 5, fiber_g: 2 },
  { name: "Anticucho de corazón", serving_unit: "unidad", serving_size: 1, kcal: 90, protein_g: 12, carbs_g: 2, fat_g: 4, fiber_g: 0 },
  { name: "Empanada", serving_unit: "unidad", serving_size: 1, kcal: 250, protein_g: 8, carbs_g: 28, fat_g: 11, fiber_g: 1 },
  { name: "Tamales", serving_unit: "unidad", serving_size: 1, kcal: 290, protein_g: 9, carbs_g: 35, fat_g: 13, fiber_g: 3 },
  { name: "Humita", serving_unit: "unidad", serving_size: 1, kcal: 180, protein_g: 5, carbs_g: 28, fat_g: 6, fiber_g: 3 },
  { name: "Chicharrón de pollo", serving_unit: "g", serving_size: 150, kcal: 320, protein_g: 25, carbs_g: 8, fat_g: 20, fiber_g: 0 }
];

/**
 * Combos precargados.
 */
export const PRELOAD_COMBOS: Array<{ name: string; items: { name: string; grams: number }[] }> = [
  {
    name: "Pollo cocido + Arroz + Brócoli",
    items: [
      { name: "Pechuga de pollo cocida", grams: 150 },
      { name: "Arroz blanco cocido", grams: 200 },
      { name: "Brócoli", grams: 100 }
    ]
  },
  {
    name: "Yogur + Avena + Almendras",
    items: [
      { name: "Yogur griego natural", grams: 200 },
      { name: "Avena cruda", grams: 40 },
      { name: "Almendras", grams: 15 }
    ]
  },
  {
    name: "Huevos cocidos + Pan + Tomate",
    items: [
      { name: "Huevo entero cocido", grams: 0 },
      { name: "Pan integral", grams: 50 },
      { name: "Tomate", grams: 80 }
    ]
  },
  {
    name: "Post-entreno: Whey + Plátano + Creatina",
    items: [
      { name: "Whey protein isolate", grams: 30 },
      { name: "Plátano", grams: 0 },
      { name: "Creatina monohidrato", grams: 5 }
    ]
  },
  {
    name: "Desayuno campeón: Avena + Huevo + Palta",
    items: [
      { name: "Avena cocida", grams: 250 },
      { name: "Huevo entero cocido", grams: 0 },
      { name: "Palta/aguacate", grams: 50 }
    ]
  },
  {
    name: "Lomo saltado casero fit",
    items: [
      { name: "Carne magra de res cocida", grams: 150 },
      { name: "Arroz blanco cocido", grams: 150 },
      { name: "Papa sancochada", grams: 100 },
      { name: "Tomate", grams: 60 }
    ]
  }
];
