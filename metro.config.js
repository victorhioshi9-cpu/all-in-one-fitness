const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = (config.resolver.sourceExts || []).filter((ext) => ext !== "sql");
config.resolver.assetExts = config.resolver.assetExts || [];
if (!config.resolver.assetExts.includes("sql")) {
  config.resolver.assetExts.push("sql");
}

module.exports = config;