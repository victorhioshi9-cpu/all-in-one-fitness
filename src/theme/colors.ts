/**
 * colors.ts - Paleta oscura de alto contraste para uso en gimnasio.
 * - Fondo casi negro puro (#08080c) con acento naranja vivo (#ff6b35) para
 *   máximo contraste incluso con sudor en pantalla y poca luz.
 * - Verde/amarillo/rojo para estados biomecánicos.
 */
export const colors = {
  bg: "#08080c",
  bgElevated: "#101018",
  bgCard: "#13131f",
  bright: "#ffffff",
  text: "#e6e8f0",
  textMuted: "#8a8fa3",
  dim: "#1d1f2e",

  accent: "#ff6b35",
  accentDim: "rgba(255,107,53,0.18)",

  ok: "#22c55e",            // verde (fase IDLE / rep OK)
  eccentric: "#3b82f6",     // azul (bajada)
  bottom: "#facc15",        // amarillo (contracción máxima)
  concentric: "#06b6d4",    // cyan (subida)
  warning: "#f59e0b",
  error: "#ef4444"
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
