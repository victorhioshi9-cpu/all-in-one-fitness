export default ({ config }) => ({
  ...config,
  name: "All-in-One Fitness",
  slug: "all-in-one-fitness",
  version: "0.3.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "aiofitness",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  android: {
    package: "com.aiofitness.coach",
    versionCode: 3,
    versionName: "0.3.0",
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WAKE_LOCK",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_HEALTH",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.BODY_SENSORS",
      "android.permission.BODY_SENSORS_BACKGROUND",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM"
    ],
    blockedPermissions: [],
    minSdkVersion: 26,
    compileSdkVersion: 35,
    targetSdkVersion: 35
  },
  plugins: [
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "Esta app necesita la cámara para detectar tu postura en tiempo real y darte correcciones biomecánicas. El video nunca sale del dispositivo.",
        enableMicrophonePermission: true,
        microphonePermissionText:
          "El micrófono se usa solo si decides grabar audio al exportar una serie.",
        enableFrameProcessors: true,
        enableCodeScanner: false
      }
    ],
    "expo-file-system",
    [
      "react-native-health-connect",
      {
        readTypes: [
          "Steps", "HeartRate", "ActiveCaloriesBurned", "BasalMetabolicRate",
          "SleepSession", "Weight", "BodyFat", "Height",
          "HeartRateVariabilityRmssd", "Hydration"
        ],
        writeTypes: [
          "ExerciseSession", "ActiveCaloriesBurned", "Steps", "Weight"
        ]
      }
    ],
    "./plugins/fix-permissions-service",
    "./plugins/with-health-connect-queries",
    "./plugins/with-health-connect-delegate",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          buildFeatures: { buildConfig: true },
          extraMavenRepos: [
            "https://dl.maven.org/maven2/",
            "https://maven.google.com/"
          ]
        }
      }
    ]
  ],
  extra: {
    eas: {
      projectId: "dd6b24b9-7e63-4382-b01f-f60460cf7e12"
    },
    storybookEnabled: false
  },
  splash: {
    image: "./assets/icon.png",
    resizeMode: "contain",
    backgroundColor: "#090d16"
  },
  updates: { enabled: false },
  runtimeVersion: { policy: "appVersion" }
});
