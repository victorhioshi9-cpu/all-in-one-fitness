/**
 * with-health-connect-delegate.js
 * ----------------------------------------------------------------------------
 * Expo config plugin que añade a MainActivity.kt la línea:
 *
 *     HealthConnectPermissionDelegate.setPermissionDelegate(this)
 *
 * dentro de onCreate(). Esto es **obligatorio** en react-native-health-connect
 * v3+ porque si no, al llamar a `requestPermission()` desde JS, no se puede
 * lanzar la actividad de permisos de Health Connect y la app crashea con
 * `IllegalStateException: Permission delegate is not set` o un
 * `SecurityException` silencioso.
 *
 * El plugin oficial de react-native-health-connect SUELE añadir esta línea
 * automáticamente, pero hay casos (configuraciones con MainActivity en Java
 * o con customizaciones manuales) en los que no se inyecta. Este plugin es
 * idempotente y no duplica la línea si ya existe.
 *
 * Declarado en app.config.ts -> plugins: ["./plugins/with-health-connect-delegate"].
 */
const { withMainActivity } = require("expo/config-plugins");

const DELEGATE_LINE = "HealthConnectPermissionDelegate.setPermissionDelegate(this)";
const DELEGATE_IMPORT = "import androidx.health.connect.client.permission.HealthConnectPermissionDelegate";

module.exports = function withHealthConnectDelegate(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      console.warn(
        "[with-hc-delegate] MainActivity no es Kotlin (" +
        cfg.modResults.language +
        "). Saltando. Revisa manualmente para añadir HealthConnectPermissionDelegate."
      );
      return cfg;
    }

    let contents = cfg.modResults.contents;

    // 1) Añadir import si no existe
    if (!contents.includes("HealthConnectPermissionDelegate")) {
      // Buscar el último import statement e insertar después.
      const importMatch = contents.match(/^\s*import\s+[^\n]+\s*$/gm);
      if (importMatch && importMatch.length > 0) {
        const lastImport = importMatch[importMatch.length - 1];
        const lastImportIdx = contents.lastIndexOf(lastImport);
        contents =
          contents.slice(0, lastImportIdx + lastImport.length) +
          "\n" + DELEGATE_IMPORT +
          contents.slice(lastImportIdx + lastImport.length);
      } else {
        // No hay imports; insertar al inicio.
        contents = DELEGATE_IMPORT + "\n" + contents;
      }
    }

    // 2) Añadir la llamada dentro de onCreate()
    if (!contents.includes(DELEGATE_LINE)) {
      // Buscar onCreate() y la llamada a super.onCreate()
      const onCreateRe = /(override\s+fun\s+onCreate\s*\(\s*savedInstanceState:\s*Bundle\?\s*\)\s*\{[\s\S]*?super\.onCreate\(\s*savedInstanceState\s*\))/;
      if (onCreateRe.test(contents)) {
        contents = contents.replace(onCreateRe, `$1\n    ${DELEGATE_LINE}`);
      } else {
        // Plan B: sin savedInstanceState en la firma
        const onCreateRe2 = /(override\s+fun\s+onCreate\s*\(\s*\)\s*\{[\s\S]*?super\.onCreate\(\s*\))/;
        if (onCreateRe2.test(contents)) {
          contents = contents.replace(onCreateRe2, `$1\n    ${DELEGATE_LINE}`);
        } else {
          // Plan C: buscar cualquier super.onCreate() y meter después
          contents = contents.replace(
            /(super\.onCreate\([^)]*\))/,
            `$1\n    ${DELEGATE_LINE}`
          );
        }
      }
    }

    if (contents.includes(DELEGATE_LINE)) {
      console.log("[with-hc-delegate] HealthConnectPermissionDelegate.setPermissionDelegate(this) OK");
    } else {
      console.warn(
        "[with-hc-delegate] WARNING: no se pudo inyectar setPermissionDelegate en onCreate(). " +
        "Debes añadir manualmente en MainActivity.kt:\n  " + DELEGATE_LINE
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};

module.exports.default = module.exports;
