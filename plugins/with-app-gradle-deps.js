/**
 * with-app-gradle-deps.js
 * ----------------------------------------------------------------------------
 * Expo config plugin que añade directamente al `android/app/build.gradle` del
 * proyecto Android generado por `expo prebuild` las dependencias nativas
 * que nuestros archivos Kotlin en android-native/ necesitan.
 *
 * Por qué NO usamos solo `expo-build-properties.android.dependencies`:
 *   Aunque expo-build-properties debería inyectar las dependencias en
 *   `app/build.gradle`, en la práctica (con Expo SDK 51 + AGP 8.2.1) NO las
 *   propaga correctamente al módulo :app. Las dependencias se quedan en el
 *   `android/build.gradle` raíz pero el compilador Kotlin del módulo :app no
 *   las ve → errores "Unresolved reference: mediapipe", etc.
 *
 * Estrategia ROBUSTA (v2 — sin regex problemático):
 *   Antes intentaba capturar y reconstruir el bloque `dependencies { ... }`
 *   con regex `/dependencies\s*\{([^}]*)\}/s`. Eso rompía el archivo si
 *   dentro había `if/else` anidados con `}` internos (que SIEMPRE los hay
 *   por el bloque `if (hermesEnabled) { ... } else { ... }`).
 *
 *   Ahora: solo busca la línea `dependencies {` y inserta las nuevas líneas
 *   justo DESPUÉS, sin tocar el resto del archivo. Idempotente.
 *
 * Dependencias añadidas:
 *   - com.google.mediapipe:tasks-vision:0.10.14
 *   - androidx.health.connect:connect-client:1.1.0-alpha11
 *   - androidx.camera:camera-core:1.3.4
 *   - androidx.appcompat:appcompat:1.6.1
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const DEPS_TO_ADD = [
  'implementation "com.google.mediapipe:tasks-vision:0.10.14"',
  'implementation "androidx.health.connect:connect-client:1.1.0-alpha11"',
  'implementation "androidx.camera:camera-core:1.3.4"',
  'implementation "androidx.appcompat:appcompat:1.6.1"'
];

module.exports = function withAppGradleDeps(config) {
  return withAppBuildGradle(config, (cfg) => {
    const lines = cfg.modResults.contents.split("\n");

    // 1) Buscar la línea "dependencies {" (con o sin indentación).
    //    Solo la PRIMERA ocurrencia: en Expo RN 0.74 hay un único bloque
    //    dependencies en app/build.gradle.
    let depsLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*dependencies\s*\{/.test(lines[i])) {
        depsLineIdx = i;
        break;
      }
    }

    // 2) Determinar qué dependencias faltan (búsqueda simple de substring,
    //    sin regex problemático).
    const fullContents = cfg.modResults.contents;
    const toInsert = [];
    for (const dep of DEPS_TO_ADD) {
      // Extraer "group:artifact" para buscar (sin versión, porque la versión
      // puede venir dada por otra fuente como ext variables).
      // dep = 'implementation "com.google.mediapipe:tasks-vision:0.10.14"'
      // → artifactKey = "com.google.mediapipe:tasks-vision"
      const m = dep.match(/"([^"]+):([^"]+):/);
      if (!m) continue;
      const artifactKey = `${m[1]}:${m[2]}`;

      // Si el artifactKey ya está en el archivo (cualquier versión), NO añadir.
      if (fullContents.includes(artifactKey)) {
        continue;
      }
      toInsert.push("    " + dep);
    }

    if (toInsert.length === 0) {
      console.log("[with-app-gradle-deps] todas las dependencias ya presentes, sin cambios.");
      return cfg;
    }

    // 3) Insertar las líneas nuevas.
    if (depsLineIdx === -1) {
      // No encontramos "dependencies {"; creamos un nuevo bloque al final.
      console.warn(
        "[with-app-gradle-deps] WARNING: 'dependencies {' no encontrado, " +
        "creando nuevo bloque al final del archivo."
      );
      lines.push("");
      lines.push("dependencies {");
      for (const d of toInsert) lines.push(d);
      lines.push("}");
    } else {
      // Insertar justo DESPUÉS de la línea "dependencies {".
      // splice muta el array; insertamos en orden inverso para mantener orden.
      for (let j = toInsert.length - 1; j >= 0; j--) {
        lines.splice(depsLineIdx + 1, 0, toInsert[j]);
      }
    }

    cfg.modResults.contents = lines.join("\n");
    console.log(
      `[with-app-gradle-deps] ${toInsert.length} dependencia(s) añadida(s) a app/build.gradle`
    );
    return cfg;
  });
};

module.exports.default = module.exports;
