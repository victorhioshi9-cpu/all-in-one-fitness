module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
      "babel-preset-expo",
        {
          "react-native-reanimated": {
            // Habilita worklets para animaciones suaves del overlay
            enablePlugin: true
          }
        }
      ]
    ],
    plugins: [
      // El frame processor de VisionCamera necesita este plugin
      [
        "react-native-reanimated/plugin",
        {
          globals: ["__frameProcessor"]
        }
      ]
    ]
  };
};
