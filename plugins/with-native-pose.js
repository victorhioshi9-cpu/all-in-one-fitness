/**
 * with-native-pose.js
 * ----------------------------------------------------------------------------
 * Expo config plugin que instala el plugin nativo de PoseLandmarker.
 *
 * v0.3.9 — Enfoque robusto para MainApplication.kt de Expo SDK 51 New Arch.
 * La estructura real del getPackages() generado por Expo es:
 *
 *   override fun getPackages(): List<ReactPackage> {
 *     // Packages that cannot be autolinked yet can be added manually here, for example:
 *     // packages.add(new MyReactNativePackage());
 *     return PackageList(this).packages
 *   }
 *
 * Para añadir nuestro package, reemplazamos:
 *   return PackageList(this).packages
 * por:
 *   return PackageList(this).packages + PoseLandmarkerPluginPackage()
 *
 * El operador `+` es idiomático Kotlin para concatenar List + elemento.
 * Funciona sin importar si el return está en una sola línea o en varias.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { withDangerousMod, withMainApplication } = require("expo/config-plugins");

const PACKAGE_NAME = "com.aiofitness.coach";
const POSE_PACKAGE_DIR = "com/aiofitness/pose";

const POSE_MODEL_URLS = [
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  "https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Full/resolve/main/pose_landmarker_full.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite/resolve/main/pose_landmarker_lite.task",
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
];
const POSE_MODEL_FILENAME = "pose_landmarker.task";
const MIN_MODEL_SIZE = 5_000_000;

const IMPORT_LINE = "import com.aiofitness.pose.PoseLandmarkerPluginPackage";

module.exports = function withNativePose(config) {
  // 1) Copiar .kt + descargar modelo
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;

      const sourceDir = path.join(projectRoot, "android-native", "pose");
      const destDir = path.join(androidRoot, "app", "src", "main", "java", POSE_PACKAGE_DIR);

      if (!fs.existsSync(sourceDir)) {
        throw new Error(`with-native-pose: no existe ${sourceDir}`);
      }

      fs.mkdirSync(destDir, { recursive: true });

      for (const f of ["PoseLandmarkerPlugin.kt", "PoseLandmarkerPluginPackage.kt"]) {
        const src = path.join(sourceDir, f);
        const dst = path.join(destDir, f);
        if (!fs.existsSync(src)) throw new Error(`with-native-pose: falta ${src}`);
        fs.copyFileSync(src, dst);
        console.log(`[with-native-pose] copiado: ${dst}`);
      }

      const assetsDir = path.join(androidRoot, "app", "src", "main", "assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      const modelDestPath = path.join(assetsDir, POSE_MODEL_FILENAME);

      if (fs.existsSync(modelDestPath) && fs.statSync(modelDestPath).size >= MIN_MODEL_SIZE) {
        console.log(`[with-native-pose] modelo ya existe (${fs.statSync(modelDestPath).size} bytes)`);
      } else {
        console.log("[with-native-pose] descargando modelo pose_landmarker.task (~9MB)...");
        await downloadModelWithFallbacks(modelDestPath);
        console.log(`[with-native-pose] modelo descargado: ${fs.statSync(modelDestPath).size} bytes`);
      }

      return cfg;
    }
  ]);

  // 2) Modificar MainApplication.kt — enfoque robusto
  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    let changed = false;

    // 2a) Añadir import si no existe
    if (!contents.includes("PoseLandmarkerPluginPackage")) {
      const lines = contents.split("\n");
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\s*import\s+/)) lastImportIdx = i;
      }
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
        contents = lines.join("\n");
        console.log("[with-native-pose] import añadido tras línea " + (lastImportIdx + 1));
      } else {
        const pkgIdx = lines.findIndex((l) => l.match(/^\s*package\s+/));
        if (pkgIdx >= 0) {
          lines.splice(pkgIdx + 1, 0, "", IMPORT_LINE);
          contents = lines.join("\n");
          console.log("[with-native-pose] import añadido tras package");
        }
      }
      changed = true;
    }

    // 2b) Añadir `+ PoseLandmarkerPluginPackage()` al getPackages().
    //     La estructura real en Expo SDK 51 New Arch es:
    //       return PackageList(this).packages
    //     Reemplazamos por:
    //       return PackageList(this).packages + PoseLandmarkerPluginPackage()
    //
    //     Chequeamos con `+ PoseLandmarkerPluginPackage()` (con paréntesis) para
    //     no confundir con el import `PoseLandmarkerPluginPackage` (sin paréntesis).
    if (!contents.includes("+ PoseLandmarkerPluginPackage()")) {
      const pattern = /PackageList\(this\)\.packages(?!\s*\+\s*PoseLandmarkerPluginPackage)/;
      if (pattern.test(contents)) {
        contents = contents.replace(
          pattern,
          "PackageList(this).packages + PoseLandmarkerPluginPackage()"
        );
        console.log("[with-native-pose] '+ PoseLandmarkerPluginPackage()' añadido tras PackageList(this).packages");
        changed = true;
      } else {
        // Plan B: buscar `val packages = PackageList(this).packages` y añadir add() en la siguiente línea.
        const pattern2 = /(val\s+packages\s*=\s*PackageList\(this\)\.packages)/;
        if (pattern2.test(contents)) {
          contents = contents.replace(
            pattern2,
            "$1\n      packages.add(PoseLandmarkerPluginPackage())"
          );
          console.log("[with-native-pose] packages.add(PoseLandmarkerPluginPackage()) añadido");
          changed = true;
        } else {
          console.warn(
            "[with-native-pose] WARNING: no se encontró 'PackageList(this).packages' en MainApplication.kt. " +
            "El plugin nativo NO se registrará en getPackages(). " +
            "Revisa MainApplication.kt manualmente y añade '+ PoseLandmarkerPluginPackage()' al return."
          );
        }
      }
    }

    // 2c) Añadir `PoseLandmarkerPluginPackage.registerIfNeeded(this)` al onCreate()
    if (!contents.includes("PoseLandmarkerPluginPackage.registerIfNeeded")) {
      const onCreatePattern = /(super\.onCreate\([^)]*\))/;
      if (onCreatePattern.test(contents)) {
        contents = contents.replace(
          onCreatePattern,
          "$1\n    PoseLandmarkerPluginPackage.registerIfNeeded(this)"
        );
        console.log("[with-native-pose] registerIfNeeded(this) añadido tras super.onCreate()");
        changed = true;
      } else {
        console.warn(
          "[with-native-pose] WARNING: no se encontró 'super.onCreate()' en MainApplication.kt."
        );
      }
    }

    if (changed) {
      cfg.modResults.contents = contents;
    }
    return cfg;
  });

  return config;
};

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
  throw new Error(
    `[with-native-pose] TODAS las URLs fallaron. Último error: ${lastErr?.message ?? "desconocido"}`
  );
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (currentUrl, redirectsLeft = 5) => {
      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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
