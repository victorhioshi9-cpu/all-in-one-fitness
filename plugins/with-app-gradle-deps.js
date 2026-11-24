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
 * Solución: parchear directamente `android/app/build.gradle` con
 * `withAppBuildGradle` e insertar `implementation "..."` líneas en el bloque
 * `dependencies { }`.
 *
 * Dependencias añadidas:
 *   - com.google.mediapipe:tasks-vision:0.10.14
 *       Para PoseLandmarker, BaseOptions, RunningMode, Delegate, MPImage,
 *       BitmapImageBuilder (clases usadas en PoseLandmarkerPlugin.kt).
 *   - androidx.health.connect:connect-client:1.1.0-alpha11
 *       Para HealthConnectPermissionDelegate (usada en MainActivity.kt,
 *       inyectada por with-health-connect-delegate.js).
 *   - androidx.camera:camera-core:1.3.4
 *       Para androidx.camera.core.ImageProxy (usado en PoseLandmarkerPlugin
 *       y expuesto por VisionCamera v4 como tipo público).
 *   - androidx.appcompat:appcompat:1.6.1
 *       Dependencia transitiva de MediaPipe; la añadimos por si la versión
 *       de RN no la trae (algunos setups Custom RN 0.74 la omiten).
 *
 * Idempotente: si las dependencias ya están, no las duplica.
 *
 * Declarado en app.config.ts -> plugins: ["./plugins/with-app-gradle-deps"].
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
    let contents = cfg.modResults.contents;

    // Buscar el bloque dependencies { ... }
    const depsBlockMatch = contents.match(/dependencies\s*\{([^}]*)\}/s);
    if (!depsBlockMatch) {
      console.warn(
        "[with-app-gradle-deps] WARNING: no se encontró bloque 'dependencies {}' " +
        "en app/build.gradle. Las dependencias nativas no se añadieron."
      );
      return cfg;
    }

    const depsBlock = depsBlockMatch[1];
    let newDepsBlock = depsBlock;
    let added = 0;

    for (const dep of DEPS_TO_ADD) {
      // Comprobar si la dependencia ya está (por nombre de artifact, sin versión).
      // Ejemplo: 'implementation "com.google.mediapipe:tasks-vision:0.10.14"'
      //   → buscamos "com.google.mediapipe:tasks-vision" en el bloque.
      const artifactMatch = dep.match(/"([^"]+):([^"]+)"/);
      if (!artifactMatch) continue;
      const artifactKey = `${artifactMatch[1]}:${artifactMatch[2]}`;

      // Si ya existe cualquier versión de esa dependencia, no la duplicamos.
      const alreadyPresent = new RegExp(artifactKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(newDepsBlock);
      if (alreadyPresent) {
        continue;
      }

      // Añadir al final del bloque dependencies.
      newDepsBlock = newDepsBlock + "\n    " + dep;
      added++;
    }

    if (added > 0) {
      // Reconstruir el archivo con el nuevo bloque dependencies.
      contents = contents.replace(
        /dependencies\s*\{([^}]*)\}/s,
        `dependencies {${newDepsBlock}\n  }`
      );
      cfg.modResults.contents = contents;
      console.log(
        `[with-app-gradle-deps] ${added} dependencia(s) nativa(s) añadida(s) a app/build.gradle`
      );
    } else {
      console.log(
        "[with-app-gradle-deps] todas las dependencias ya están presentes, sin cambios."
      );
    }

    return cfg;
  });
};

module.exports.default = module.exports;
