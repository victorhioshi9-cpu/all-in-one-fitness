/**
 * with-health-connect-queries.js
 * ----------------------------------------------------------------------------
 * Expo config plugin que añade al AndroidManifest las entradas necesarias para
 * que `react-native-health-connect` v3.x funcione correctamente:
 *
 *   1) `<queries>` con el paquete `com.google.android.apps.healthdata` para que
 *      PackageVisibility (Android 11+, API 30+) permita a `isHealthConnectAvailable()`
 *      detectar si HC está instalado en Android 13- (en Android 14+ viene built-in
 *      y no necesita queries, pero no cuesta nada añadirlo).
 *
 *   2) `<intent>` para `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (este
 *      lo añade también el plugin de react-native-health-connect pero algunos
 *      setups sin autolinking completo se lo saltan).
 *
 *   3) `<intent>` para `android.intent.action.VIEW_PERMISSION_USAGE` con categoría
 *      `android.intent.category.HEALTH_PERMISSIONS` (también lo añade el plugin
 *      de la librería, pero lo re-añadimos con `tools:node="merge"` para cubrir
 *      edge cases).
 *
 * Esto resuelve:
 *   - "No detectado" cuando HC realmente está instalado (Android 13-).
 *   - Crash al pedir permisos (la actividad no tenía el intent filter correcto).
 *
 * Se declara en app.config.ts -> plugins: ["./plugins/with-health-connect-queries"].
 */
const { withAndroidManifest } = require("expo/config-plugins");

const HC_PACKAGE = "com.google.android.apps.healthdata";

module.exports = function withHealthConnectQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const $ = manifest;

    // Asegurar xmlns:tools en <manifest>
    if (!$.$?.tools) {
      $.$ = $.$ || {};
      $.$.tools = "http://schemas.android.com/tools";
    }

    // --- 1) <queries> para package visibility ---
    let queries = $.queries?.[0];
    if (!queries) {
      $.queries = $.queries || [];
      queries = { $: {}, package: [], intent: [] };
      $.queries.push(queries);
    }
    queries.package = queries.package || [];
    queries.intent = queries.intent || [];

    // Añadir el <package> si no existe
    const hasHcPackage = queries.package.some(
      (p) => p?.$?.android?.name === HC_PACKAGE || p?.$?.name === HC_PACKAGE
    );
    if (!hasHcPackage) {
      queries.package.push({
        $: { "android:name": HC_PACKAGE }
      });
      console.log(`[with-hc-queries] añadido <package android:name="${HC_PACKAGE}"/>`);
    }

    // --- 2) <intent> para ACTION_SHOW_PERMISSIONS_RATIONALE ---
    const hasRationaleIntent = queries.intent.some(
      (i) => i?.action?.[0]?.$?.["android:name"] === "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"
    );
    if (!hasRationaleIntent) {
      queries.intent.push({
        action: [{ $: { "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" } }]
      });
      console.log("[with-hc-queries] añadido intent ACTION_SHOW_PERMISSIONS_RATIONALE");
    }

    // --- 3) <intent> para VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS ---
    const hasHealthPermIntent = queries.intent.some((i) => {
      const actions = i?.action || [];
      const categories = i?.category || [];
      return actions.some((a) => a?.$?.["android:name"] === "android.intent.action.VIEW_PERMISSION_USAGE")
        && categories.some((c) => c?.$?.["android:name"] === "android.intent.category.HEALTH_PERMISSIONS");
    });
    if (!hasHealthPermIntent) {
      queries.intent.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
        category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }]
      });
      console.log("[with-hc-queries] añadido intent VIEW_PERMISSION_USAGE+HEALTH_PERMISSIONS");
    }

    return cfg;
  });
};

module.exports.default = module.exports;
