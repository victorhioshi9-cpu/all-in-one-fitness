const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

module.exports = function withLocalSqlite(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const sourceZip = path.join(root, "plugins", "assets", "sqlite-amalgamation-3450300.zip");
      const targetDir = path.join(
        root,
        "node_modules",
        "expo-sqlite",
        "android",
        "build",
        "downloads"
      );
      const targetZip = path.join(targetDir, "sqlite-amalgamation-3450300.zip");

      if (fs.existsSync(sourceZip)) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(sourceZip, targetZip);
      }

      const gradlePath = path.join(root, "node_modules", "expo-sqlite", "android", "build.gradle");
      if (fs.existsSync(gradlePath)) {
        let gradle = fs.readFileSync(gradlePath, "utf8");
        const localUri = "file://" + targetZip.replace(/\\/g, "/");
        gradle = gradle.replace(
          /src\(\s*["']https:\/\/www\.sqlite\.org\/[^"']+["']\s*\)/,
          `src(uri("${localUri}"))`
        );
        fs.writeFileSync(gradlePath, gradle, "utf8");
      }

      return cfg;
    },
  ]);
};
