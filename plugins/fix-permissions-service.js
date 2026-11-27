/**
 * fix-permissions-service.js
 * ----------------------------------------------------------------------------
 * Expo config plugin que parchea in-place el archivo
 *   node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt
 *
 * Bug original (expo-modules-core 1.12.26 línea 166):
 *   return requestedPermissions.contains(permission)
 *
 * Donde `requestedPermissions` es `Array<out String!>?` (nullable platform type).
 * En compiladores Kotlin estrictos (como el del runner de GitHub Actions),
 * esto falla con:
 *   "Only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable
 *    receiver of type Array<(out) String!>?"
 *
 * Fix aplicado:
 *   return requestedPermissions?.contains(permission) ?: false
 *
 * Por qué config plugin y NO patch-package:
 *   - patch-package requiere que el .patch aplique limpiamente contra la
 *     versión exacta de node_modules. Cambios de versión lo rompen.
 *   - El config plugin usa withDangerousMod y patchea el archivo en build-time
 *     mediante regex reemplazo, que es robusto a whitespace/encoding.
 *   - Idempotente: si el archivo ya está parcheado, no hace nada.
 *
 * Declarado en app.config.ts -> plugins: ["./plugins/fix-permissions-service"].
 */
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const TARGET_RELATIVE_PATH = path.join(
  "node_modules",
  "expo-modules-core",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "adapters",
  "react",
  "permissions",
  "PermissionsService.kt"
);

// Patrones a buscar y reemplazar. Hacemos varios para cubrir variantes
// de whitespace (4 espacios, 6 espacios, tab) y las dos versiones posibles
// del bug (sin '?.' original, y la versión 'orEmpty()' que también rompe
// en algunos setups).
const REPLACEMENTS = [
  // Variante 1: "requestedPermissions.contains(permission)" (sin safe-call)
  {
    pattern: /return\s+requestedPermissions\.contains\(permission\)/g,
    replacement: "return requestedPermissions?.contains(permission) ?: false"
  },
  // Variante 2: "requestedPermissions.orEmpty().contains(permission)"
  // (algunas versiones intentaron arreglarlo así pero .orEmpty() no existe
  // en Array<out String!>? platform type; hace falta safe-call primero)
  {
    pattern: /return\s+requestedPermissions\.orEmpty\(\)\.contains\(permission\)/g,
    replacement: "return requestedPermissions?.contains(permission) ?: false"
  }
];

module.exports = function withFixPermissionsService(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const targetPath = path.join(cfg.modRequest.projectRoot, TARGET_RELATIVE_PATH);

      if (!fs.existsSync(targetPath)) {
        console.warn(
          `[fix-permissions-service] Archivo no encontrado: ${targetPath}. ` +
          `Probablemente expo-modules-core cambió de versión. Saltando.`
        );
        return cfg;
      }

      let content = fs.readFileSync(targetPath, "utf8");
      let originalContent = content;
      let changesApplied = 0;

      for (const { pattern, replacement } of REPLACEMENTS) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          content = content.replace(pattern, replacement);
          changesApplied += matches.length;
        }
      }

      if (content === originalContent) {
        // Verifica si ya estaba parcheado
        if (content.includes("requestedPermissions?.contains(permission)")) {
          console.log("[fix-permissions-service] ya parcheado, sin cambios necesarios.");
        } else {
          console.warn(
            "[fix-permissions-service] WARNING: ninguno de los patrones coincidió. " +
            "Revisa manualmente " + targetPath
          );
        }
      } else {
        fs.writeFileSync(targetPath, content, "utf8");
        console.log(
          `[fix-permissions-service] ${changesApplied} ocurrencia(s) parcheada(s) en ` +
          `node_modules/expo-modules-core/.../PermissionsService.kt`
        );
      }

      return cfg;
    }
  ]);
};

module.exports.default = module.exports;
