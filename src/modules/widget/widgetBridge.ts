/**
 * widgetBridge.ts
 * ----------------------------------------------------------------------------
 * Bridge JS para comunicación con el widget Android.
 * - updateWidget(): fuerza refresh del widget tras un cambio en SQLite.
 * - getWidgetStats(): lee los mismos stats que muestra el widget (para
 *   verificar en la UI que coinciden).
 *
 * El widget se actualiza automáticamente cada 30 min por AppWidgetProvider,
 * pero tras un cambio importante (finalizar entreno, registrar agua) queremos
 * refresh inmediato.
 */
import { NativeModules, Platform } from "react-native";

const WidgetBridge = NativeModules.FitnessWidgetBridge;

export const widgetBridge = {
  /** Fuerza la actualización inmediata del widget. */
  async updateWidget(): Promise<void> {
    if (Platform.OS !== "android" || !WidgetBridge) return;
    try {
      await WidgetBridge.refreshAll();
    } catch (err) {
      console.warn("[widgetBridge] updateWidget failed:", err);
    }
  },

  /** Verifica si el widget ha sido añadido al home screen. */
  async isWidgetAdded(): Promise<boolean> {
    if (Platform.OS !== "android" || !WidgetBridge) return false;
    try {
      return await WidgetBridge.isWidgetAdded();
    } catch {
      return false;
    }
  }
};
