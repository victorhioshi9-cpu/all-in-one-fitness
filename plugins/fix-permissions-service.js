const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

module.exports = function withFixPermissionsService(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const target = path.join(
        cfg.modRequest.projectRoot,
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
      if (fs.existsSync(target)) {
        const content = fs.readFileSync(target, "utf8");
        const updated = content.replace(
          "return requestedPermissions.contains(permission)",
          "return requestedPermissions?.contains(permission) ?: false"
        );
        if (updated !== content) {
          fs.writeFileSync(target, updated, "utf8");
        }
      }
      return cfg;
    },
  ]);
};