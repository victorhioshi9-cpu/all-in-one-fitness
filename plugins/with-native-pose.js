/**
 * with-native-pose.js
 * ----------------------------------------------------------------------------
 * Expo config plugin (no-typescript) que instala el plugin nativo de
 * PoseLandmarker de MediaPipe en el proyecto Android generado por
 * `expo prebuild`.
 *
 * Hace tres cosas en build-time (NO en runtime):
 *
 *   1) Copia `android-native/pose/PoseLandmarkerPlugin.kt` y
 *      `PoseLandmarkerPluginPackage.kt` a
 *      `android/app/src/main/java/com/aiofitness/pose/`.
 *
 *   2) Modifica `MainApplication.kt`:
 *        - Añade el import del package.
 *        - Añade `add(PoseLandmarkerPluginPackage())` al getPackages() list.
 *        - Añade `PoseLandmarkerPluginPackage.registerIfNeeded(this)` al onCreate().
 *
 *   3) Descarga el modelo `pose_landmarker.task` desde Google Cloud Storage a
 *      `android/app/src/main/assets/pose_landmarker.task` (si no existe ya).
 *
 * Declarado en `app.config.ts` -> `plugins: ["./plugins/with-native-pose"]`.
 *
 * Idempotente: se puede ejecutar varias veces sin duplicar líneas.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { withDangerousMod, withMainApplication, AndroidConfig } = require("expo/config-plugins");

const PACKAGE_NAME = "com.aiofitness.coach";
const POSE_PACKAGE_DIR = "com/aiofitness/pose";

// Modelo de MediaPipe PoseLandmarker. Múltiples URLs para redundancia:
// El path correcto en GCS incluye la variante del modelo (_full, _lite, _heavy).
// La URL antigua sin sufijo daba 404 (Google la movió).
// Orden de preferencia:
//   1) pose_landmarker_full (mejor precisión, ~9MB) - Google Cloud Storage
//   2) pose_landmarker_full - mirror HuggingFace (en caso de que GCS tenga issues)
//   3) pose_landmarker_lite (más rápido, ~6MB) - GCS
//   4) pose_landmarker_lite - HuggingFace
//   5) pose_landmarker_heavy (mejor precisión, ~26MB) - GCS
// Si todos fallan, el plugin Kotlin lo detecta en runtime (getOrCreateLandmarker
// devuelve null) y la app sigue abriendo la cámara pero sin esqueleto. No crashea.
const POSE_MODEL_URLS = [
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  "https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Full/resolve/main/pose_landmarker_full.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite/resolve/main/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
];
const POSE_MODEL_FILENAME = "pose_landmarker.task";
// Tamaño mínimo aceptable: el modelo lite pesa ~6MB, full ~9MB, heavy ~26MB.
// Si la descarga devuelve menos de 5MB, asumimos corrupta y probamos siguiente URL.
const MIN_MODEL_SIZE = 5_000_000;

module.exports = function withNativePose(config) {
  // 1) Copy Kotlin sources + download model with withDangerousMod
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;

      // --- 1a) Copiar archivos .kt al directorio de Android ---
      const sourceDir = path.join(projectRoot, "android-native", "pose");
      const destDir = path.join(
        androidRoot,
        "app",
        "src",
        "main",
        "java",
        POSE_PACKAGE_DIR
      );

      if (!fs.existsSync(sourceDir)) {
        throw new Error(
          `with-native-pose: no existe ${sourceDir}. ` +
          `Asegúrate de que los archivos Kotlin están en android-native/pose/`
        );
      }

      fs.mkdirSync(destDir, { recursive: true });

      const filesToCopy = [
        "PoseLandmarkerPlugin.kt",
        "PoseLandmarkerPluginPackage.kt"
      ];
      for (const f of filesToCopy) {
        const src = path.join(sourceDir, f);
        const dst = path.join(destDir, f);
        if (!fs.existsSync(src)) {
          throw new Error(`with-native-pose: falta ${src}`);
        }
        fs.copyFileSync(src, dst);
        console.log(`[with-native-pose] copiado: ${dst}`);
      }

      // --- 1b) Descargar el modelo pose_landmarker.task si no existe ---
      const assetsDir = path.join(
        androidRoot,
        "app",
        "src",
        "main",
        "assets"
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      const modelDestPath = path.join(assetsDir, POSE_MODEL_FILENAME);

      if (fs.existsSync(modelDestPath)) {
        const stat = fs.statSync(modelDestPath);
        if (stat.size > MIN_MODEL_SIZE) {
          console.log(
            `[with-native-pose] modelo ya existe (${stat.size} bytes), omitiendo descarga`
          );
        } else {
          console.log(`[with-native-pose] modelo existe pero está corrupto (${stat.size} bytes < ${MIN_MODEL_SIZE}), re-descargando...`);
          fs.unlinkSync(modelDestPath);
          await downloadModelWithFallbacks(modelDestPath);
        }
      } else {
        console.log("[with-native-pose] descargando modelo pose_landmarker.task (~9MB)...");
        await downloadModelWithFallbacks(modelDestPath);
        const stat = fs.statSync(modelDestPath);
        console.log(`[with-native-pose] modelo descargado: ${stat.size} bytes`);
      }

      return cfg;
    }
  ]);

  // 2) Modificar MainApplication.kt para registrar el package y llamar registerIfNeeded
  config = withMainApplication(config, (cfg) => {
    const mainApplication = cfg.modResults.contents;

    // Las inserciones son idempotentes: comprobamos si ya están presentes.
    const importMarker = "package " + PACKAGE_NAME;
    const importLine = "import com.aiofitness.pose.PoseLandmarkerPluginPackage";

    // 2a) Añadir import si no existe
    if (!mainApplication.includes("PoseLandmarkerPluginPackage")) {
      // Insertar después de los imports existentes (al final del bloque de imports).
      // Buscamos el último `import` statement en el archivo.
      cfg.modResults.contents = insertAfterLastImport(
        mainApplication,
        importLine
      );
      console.log("[with-native-pose] import añadido a MainApplication.kt");
    }

    // 2b) Añadir add(PoseLandmarkerPluginPackage()) al getPackages()
    // En Expo SDK 51 new arch, getPackages() suele ser:
    //   override fun getPackages(): List<ReactPackage> =
    //     PackageList(this).packages.apply {
    //       // add(...) si tienes módulos nativos extras
    //     }
    if (!cfg.modResults.contents.includes("add(PoseLandmarkerPluginPackage())")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n      add(PoseLandmarkerPluginPackage())`
      );
      // Si no encontró `apply {`, intentar con la variante `apply { ... }` o lista explícita
      if (!cfg.modResults.contents.includes("add(PoseLandmarkerPluginPackage())")) {
        // Patrón alternativo: getPackages devuelve ArrayList con addAll
        cfg.modResults.contents = cfg.modResults.contents.replace(
          /(val packages = PackageList\(this\)\.packages)/,
          `$1\n      packages.add(PoseLandmarkerPluginPackage())`
        );
      }
      if (cfg.modResults.contents.includes("add(PoseLandmarkerPluginPackage())")) {
        console.log("[with-native-pose] add(PoseLandmarkerPluginPackage()) registrado");
      } else {
        console.warn(
          "[with-native-pose] WARNING: no se pudo inyectar add(PoseLandmarkerPluginPackage()) en getPackages(). " +
          "Revisa MainApplication.kt manualmente."
        );
      }
    }

    // 2c) Añadir PoseLandmarkerPluginPackage.registerIfNeeded(this) al onCreate()
    if (!cfg.modResults.contents.includes("PoseLandmarkerPluginPackage.registerIfNeeded")) {
      // En Expo SDK 51 new arch, onCreate() de MainApplication es:
      //   override fun onCreate() {
      //     super.onCreate()
      //     SoLoader.init(...)
      //     ...
      //   }
      // Inyectamos justo después de `super.onCreate()`.
      const onCreateReplaced = cfg.modResults.contents.replace(
        /(override fun onCreate\(\)\s*\{[\s\S]*?super\.onCreate\(\))/,
        `$1\n    PoseLandmarkerPluginPackage.registerIfNeeded(this)`
      );
      if (onCreateReplaced !== cfg.modResults.contents) {
        cfg.modResults.contents = onCreateReplaced;
        console.log("[with-native-pose] registerIfNeeded(this) inyectado en onCreate()");
      } else {
        // Plan B: insertar al final del onCreate() antes de la llave de cierre.
        // Buscamos el primer `super.onCreate()` y metemos nuestra línea después.
        cfg.modResults.contents = cfg.modResults.contents.replace(
          /(super\.onCreate\(\))/,
          `$1\n    PoseLandmarkerPluginPackage.registerIfNeeded(this)`
        );
        if (cfg.modResults.contents.includes("PoseLandmarkerPluginPackage.registerIfNeeded")) {
          console.log("[with-native-pose] registerIfNeeded(this) inyectado (plan B)");
        } else {
          console.warn(
            "[with-native-pose] WARNING: no se pudo inyectar registerIfNeeded en onCreate()."
          );
        }
      }
    }

    return cfg;
  });

  return config;
};

/**
 * Inserta `line` justo después del último `import ...` del archivo Kotlin.
 * Si no encuentra imports, lo inserta después de `package ...`.
 */
function insertAfterLastImport(source, line) {
  const lines = source.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*import\s+/)) {
      lastImportIdx = i;
    }
  }
  if (lastImportIdx === -1) {
    // Buscar la línea `package ...` e insertar después.
    const pkgIdx = lines.findIndex((l) => l.match(/^\s*package\s+/));
    if (pkgIdx === -1) {
      // No encontramos package; al inicio.
      return line + "\n" + source;
    }
    lines.splice(pkgIdx + 1, 0, "", line);
  } else {
    lines.splice(lastImportIdx + 1, 0, line);
  }
  return lines.join("\n");
}

/**
 * Descarga el modelo probando varias URLs en orden. Devuelve true si alguna
 * tuvo éxito. Lanza Error solo si TODAS fallan.
 */
async function downloadModelWithFallbacks(destPath) {
  let lastErr = null;
  for (let i = 0; i < POSE_MODEL_URLS.length; i++) {
    const url = POSE_MODEL_URLS[i];
    console.log(`[with-native-pose] intentando URL ${i + 1}/${POSE_MODEL_URLS.length}: ${url}`);
    try {
      await downloadFile(url, destPath);
      const stat = fs.statSync(destPath);
      if (stat.size >= MIN_MODEL_SIZE) {
        console.log(`[with-native-pose] descarga OK desde URL #${i + 1} (${stat.size} bytes)`);
        return true;
      }
      console.warn(`[with-native-pose] URL #${i + 1} devolvió ${stat.size} bytes (demasiado pequeño), probando siguiente...`);
      fs.unlinkSync(destPath);
    } catch (err) {
      console.warn(`[with-native-pose] URL #${i + 1} falló: ${err.message}`);
      lastErr = err;
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch {}
      }
    }
  }
  // Todas fallaron. Lanzamos con mensaje claro para que el build falle y se vea
  // en el log del workflow, PERO el plugin Kotlin maneja el modelo ausente
  // graceful en runtime (la cámara abre sin esqueleto). Aún así, preferimos
  // fallar el build para forzar revisión.
  throw new Error(
    `[with-native-pose] TODAS las URLs de descarga del modelo fallaron. ` +
    `Último error: ${lastErr?.message ?? "desconocido"}. ` +
    `URLs probadas: ${POSE_MODEL_URLS.join(", ")}`
  );
}

/** Descarga un fichero binario desde una URL HTTPS al filesystem. */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (currentUrl, redirectsLeft = 5) => {
      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Redirect
            if (redirectsLeft === 0) {
              reject(new Error(`Demasiados redirects descargando ${url}`));
              return;
            }
            res.destroy();
            request(res.headers.location, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} descargando ${currentUrl}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
        })
        .on("error", (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
    };
    request(url);
  });
}

module.exports.default = module.exports;
