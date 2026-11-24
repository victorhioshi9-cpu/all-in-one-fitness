/**
 * colors.ts - Paleta oscura de alto contraste para uso en gimnasio.
 * - Fondo casi negro puro (#08080c) con acento naranja vivo (#ff6b35) para
 *   máximo contraste incluso con sudor en pantalla y poca luz.
 * - Verde/amarillo/rojo para estados biomecánicos.
 *
 * Rediseño v0.4:
 *   - Nuevos tonos de superficie (surface / surfaceElevated) para tarjetas
 *     elevadas y modales.
 *   - Pares de gradientes (sin instalar expo-linear-gradient: se simulan con
 *     Views apilados con rgba) para cabeceras, botones y badges.
 *   - Colores por categoría de alimento para chips y badges en Nutrición.
 *   - textDim para texto secundario dentro de tarjetas elevadas.
 */
export const colors = {
  bg: "#08080c",
  bgElevated: "#101018",
  bgCard: "#13131f",
  bright: "#ffffff",
  text: "#e6e8f0",
  textMuted: "#8a8fa3",
  textDim: "#6b7280",
  dim: "#1d1f2e",

  // Superficies adicionales para el rediseño
  surface: "#16161f",
  surfaceElevated: "#1d1d2b",

  accent: "#ff6b35",
  accentDim: "rgba(255,107,53,0.18)",

  ok: "#22c55e",            // verde (fase IDLE / rep OK)
  eccentric: "#3b82f6",     // azul (bajada)
  bottom: "#facc15",        // amarillo (contracción máxima)
  concentric: "#06b6d4",    // cyan (subida)
  warning: "#f59e0b",
  error: "#ef4444",

  // --- Pares de gradientes (se simulan con Views apilados rgba) ---
  gradientPrimary: ["#ff6b35", "#ff9558"] as [string, string],
  gradientSecondary: ["#0f172a", "#1e293b"] as [string, string],
  gradientSuccess: ["#22c55e", "#16a34a"] as [string, string],

  // --- Colores por categoría de alimento ---
  catProtein: "#ef4444",   // 🔴 Proteínas
  catCarbs: "#facc15",     // 🟡 Carbohidratos
  catVeg: "#22c55e",       // 🟢 Vegetales
  catDairy: "#3b82f6",     // 🔵 Lácteos
  catFat: "#a855f7",       // 🥜 Grasas
  catSupp: "#06b6d4",      // 💊 Suplementos
  catDish: "#f97316",      // 🍽 Platillos
  catDrink: "#8b5cf6",     // 🥤 Bebidas
  catCombo: "#ec4899"      // ⭐ Combos
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  isDark: true
} as const;
