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

    // --- 4) <activity-alias> dentro de <application> para Android 14+ ---
    // Sin este activity-alias, al llamar requestPermission() la app crashea
    // con ActivityNotFoundException porque HC intenta lanzar una actividad
    // que no existe. El alias redirige a MainActivity.
    const application = $.application?.[0];
    if (application) {
      application["activity-alias"] = application["activity-alias"] || [];

      const hasPermissionAlias = application["activity-alias"].some(
        (a) => a?.$?.["android:name"] === "ViewPermissionUsageActivity"
      );

      if (!hasPermissionAlias) {
        // Buscar el nombre de la actividad principal (MainActivity) del primer
        // <activity> con MAIN/LAUNCHER intent-filter.
        let mainActivityName = ".MainActivity"; // default sensible
        const activities = application.activity || [];
        for (const act of activities) {
          const intentFilters = act["intent-filter"] || [];
          for (const f of intentFilters) {
            const categories = (f.category || []).map((c) => c?.$?.["android:name"]);
            const actions = (f.action || []).map((a) => a?.$?.["android:name"]);
            if (
              actions.includes("android.intent.action.MAIN") &&
              categories.includes("android.intent.category.LAUNCHER")
            ) {
              mainActivityName = act?.$?.["android:name"] || mainActivityName;
              break;
            }
          }
        }

        application["activity-alias"].push({
          $: {
            "android:name": "ViewPermissionUsageActivity",
            "android:exported": "true",
            "android:targetActivity": mainActivityName,
            "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE"
          },
          "intent-filter": [
            {
              action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
              category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }]
            }
          ]
        });
        console.log(
          `[with-hc-queries] añadido <activity-alias ViewPermissionUsageActivity> targetActivity=${mainActivityName}`
        );
      }

      // --- 5) Intent-filter ACTION_SHOW_PERMISSIONS_RATIONALE en MainActivity ---
      // Para Android 13-, el rationale debe estar en la actividad principal.
      const activities = application.activity || [];
      for (const act of activities) {
        const name = act?.$?.["android:name"];
        if (!name) continue;
        // Si es la MainActivity (por convención de Expo RN)
        if (name.endsWith("MainActivity")) {
          act["intent-filter"] = act["intent-filter"] || [];
          const hasRationale = (act["intent-filter"] || []).some((f) => {
            const actions = (f.action || []).map((a) => a?.$?.["android:name"]);
            return actions.includes("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE");
          });
          if (!hasRationale) {
            act["intent-filter"].push({
              action: [{ $: { "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" } }]
            });
            console.log(`[with-hc-queries] añadido intent-filter rationale en ${name}`);
          }
          break;
        }
      }
    }

    // --- 6) <uses-permission> health.* en el manifest raíz ---
    // El plugin de react-native-health-connect NO añade los <uses-permission>
    // automáticamente. Los lee de readTypes/writeTypes pero NO los convierte en
    // <uses-permission>. Sin estos permisos en el manifest, la app NO aparece
    // en la lista de apps que pueden pedir acceso a Health Connect.
    // Lista completa de permisos HC: https://developer.android.com/reference/kotlin/androidx/health/connect/client/permission/HealthPermission
    const HEALTH_PERMISSIONS = [
      // Read permissions (todas las que pedimos en app.config.ts readTypes)
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
      "android.permission.health.READ_TOTAL_CALORIES_BURNED",
      "android.permission.health.READ_BASAL_METABOLIC_RATE",
      "android.permission.health.READ_SLEEP",
      "android.permission.health.READ_WEIGHT",
      "android.permission.health.READ_BODY_FAT",
      "android.permission.health.READ_HEIGHT",
      "android.permission.health.READ_HEART_RATE_VARIABILITY",
      "android.permission.health.READ_HYDRATION",
      "android.permission.health.READ_EXERCISE",
      // Write permissions (todas las que pedimos en app.config.ts writeTypes)
      "android.permission.health.WRITE_EXERCISE",
      "android.permission.health.WRITE_ACTIVE_CALORIES_BURNED",
      "android.permission.health.WRITE_TOTAL_CALORIES_BURNED",
      "android.permission.health.WRITE_STEPS",
      "android.permission.health.WRITE_WEIGHT",
      "android.permission.health.WRITE_HEART_RATE",
      "android.permission.health.WRITE_SLEEP",
      "android.permission.health.WRITE_HYDRATION",
      // Permisos avanzados (báscula S400 los escribe vía Mi Fitness)
      "android.permission.health.READ_BODY_WATER_MASS",
      "android.permission.health.READ_BONE_MASS",
      "android.permission.health.READ_LEAN_BODY_MASS",
      "android.permission.health.WRITE_BODY_WATER_MASS",
      "android.permission.health.WRITE_BONE_MASS",
      "android.permission.health.WRITE_LEAN_BODY_MASS"
    ];

    // Asegurar que manifest tiene array 'uses-permission'
    const usesPermissionArray = $["uses-permission"] || [];
    $["uses-permission"] = usesPermissionArray;

    let addedPerms = 0;
    for (const perm of HEALTH_PERMISSIONS) {
      const alreadyExists = usesPermissionArray.some(
        (p) => p?.$?.["android:name"] === perm
      );
      if (!alreadyExists) {
        usesPermissionArray.push({
          $: { "android:name": perm }
        });
        addedPerms++;
      }
    }
    if (addedPerms > 0) {
      console.log(`[with-hc-queries] ${addedPerms} <uses-permission health.*> añadidos al manifest`);
    }

    return cfg;
  });
};

module.exports.default = module.exports;
