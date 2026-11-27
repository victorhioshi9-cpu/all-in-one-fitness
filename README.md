# All-in-One Fitness & AI Biomechanical Coach

Aplicación Android (APK) integral de gimnasio, biomecánica, nutrición, salud y entrenamiento con IA on-device, integración con wearables (Mi Fitness + Xiaomi S400 Scale vía Health Connect) e Inteligencia Cruzada.

## Stack completo

| Capa | Tecnología |
|---|---|
| UI | React Native 0.74 + Expo SDK 51 (Dev Build, NO Expo Go) |
| Cámara | `react-native-vision-camera` v4.5 |
| Overlay esqueleto | `@shopify/react-native-skia` (60fps render thread) |
| Pose detection on-device | MediaPipe Tasks Vision 0.10.14 (GPU delegate) |
| Bridge nativo | Kotlin: PoseLandmarkerPlugin + AudioCoachModule + LocalNotificationsModule + FitnessWidgetProvider |
| Wearables | `react-native-health-connect` v3.2 (HC API 1.1+) |
| Sync cloud | `@supabase/supabase-js` + PostgreSQL (RLS por deviceId) |
| Persistencia | `expo-sqlite` (SQLite WAL + sync_queue + triggers) |
| Estado | `zustand` |
| Sync worker | `react-native-background-actions` (foreground service Android) |
| Identidad | `expo-secure-store` + Android ID |
| Audio coach ducking | Android AudioFocus MAY_DUCK + TextToSpeech es_ES |
| Notificaciones locales | AlarmManager + NotificationManager (sin FCM, sin internet) |
| Widget Android | AppWidgetProvider con botones de acción |
| Export | `expo-file-system` + `expo-sharing` (JSON + CSV) |
| Escáner barcode | VisionCamera + Open Food Facts API (cache SQLite) |

## Módulos

| Módulo | Descripción |
|---|---|
| **Coach AI** | Cámara con esqueleto en tiempo real, VBT, asimetría L/R, ghost pacer, grabación+replay, audio ducking |
| **Readiness** | Score cruzando sueño + FC reposo + fatiga muscular + recomendaciones |
| **Salud** | Health Connect: steps, HR, kcal, sueño, composición corporal S400, estrés |
| **Entrenos** | Rutinas, plate calculator, HIIT, rest timer, tags 1-tap, doble progresión, deload, heatmap muscular 7d, post-workout summary |
| **Nutrición** | Macros, agua, suplementos, plantillas precargadas (40+ alimentos), escáner barcode, comparativa visual |
| **Calendario** | Mensual/semanal coloreado por cumplimiento, planificación futura |
| **Periodización** | Ciclos X semanas (déficit/recomp/volumen) con metas semanales |
| **Plan comidas** | Asignación semanal 7x4 + lista de compras auto-generada |
| **Recomendaciones** | Motor IA cruzando readiness + calendario + heatmap + nutrición + cámara |
| **Recordatorios** | Locales (sin internet): entreno, agua, suplementos, metas |
| **Export** | JSON/CSV por workout o backup completo por tabla |

## Estructura del proyecto

```
all-in-one-fitness/
├── app.config.ts             # Expo config + permisos + plugins Fase 3
├── eas.json                  # profiles: development / preview (APK) / production
├── .env.example              # Variables EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
├── package.json
├── supabase/
│   ├── schema.sql            # Tablas + RLS por deviceId + RPCs (Fase 2)
│   └── README.md
├── android-native/
│   ├── PoseLandmarkerPlugin.kt              # MediaPipe (Fase 1)
│   ├── PoseLandmarkerPluginPackage.kt
│   ├── SyncForegroundService.kt             # Stub WorkManager (Fase 2)
│   ├── audio/AudioCoachModule.kt            # AudioFocus ducking + TTS (Fase 3)
│   ├── notifications/LocalNotificationsModule.kt  # Recordatorios locales (Fase 3)
│   ├── widget/FitnessWidgetProvider.kt      # Widget home-screen (Fase 3)
│   ├── widget/WidgetDataStore.kt            # Lectura SQLite directa del widget
│   ├── widget/widget_fitness.xml            # Layout widget
│   ├── widget/widget_bg.xml
│   ├── widget/widget_manifest_snippet.xml   # Receiver + meta-data
│   ├── widget/AndroidManifest.snippet.xml   # Snippet a copiar en manifest
│   ├── MainApplication.kt.snippet           # Snippet registro módulos
│   ├── app.build.gradle                     # Dependencias Gradle
│   └── proguard-rules.pro
├── prisma/schema.prisma                     # Esquema cloud (mirror SQLite)
└── src/
    ├── App.tsx                              # Init identidad + Supabase + worker + audio + widget + deep links
    ├── navigation/RootNavigator.tsx         # 5 tabs + 7 pantallas stack modal
    ├── modules/
    │   ├── camera/                          # Fase 1 + 3: VBT, asimetría, ghost, recorder
    │   │   ├── CameraScreen.tsx
    │   │   ├── SkeletonOverlay.tsx
    │   │   ├── CalibrationOverlay.tsx
    │   │   ├── RepCounterHUD.tsx
    │   │   ├── SmallSpaceGuide.tsx
    │   │   ├── GhostPacer.tsx               # Ghost overlay + live indicator + replay
    │   │   └── hooks/
    │   │       ├── usePoseFrameProcessor.ts
    │   │       ├── useCameraThermalGuard.ts
    │   │       ├── useVbtVelocity.ts        # Fase 3: VBT por esqueleto
    │   │       ├── useAsymmetryDetection.ts # Fase 3: L/R comparison
    │   │       └── useSetRecorder.ts        # Fase 3: grabación con overlay
    │   ├── biomechanics/                    # Fase 1
    │   │   ├── landmarks.ts
    │   │   ├── angleUtils.ts
    │   │   ├── repStateMachine.ts
    │   │   ├── exercisePresets.ts
    │   │   └── faultDetector.ts
    │   ├── persistence/                     # Fase 1 + 3
    │   │   ├── schema.sql                   # Fase 1
    │   │   ├── schema_phase3.sql            # Fase 3 (routines, foods, periodization, etc.)
    │   │   ├── db.ts
    │   │   └── repositories/setRepo.ts
    │   ├── cloud/                           # Fase 2
    │   │   ├── deviceIdentity.ts
    │   │   ├── supabaseClient.ts
    │   │   └── syncService.ts
    │   ├── health/                          # Fase 2
    │   │   ├── healthConnectClient.ts
    │   │   ├── sourceFilter.ts
    │   │   ├── types.ts
    │   │   ├── HealthConnectScreen.tsx
    │   │   ├── readers/{steps,heartRate,calories,sleep,bodyComposition,stress}Reader.ts
    │   │   └── writers/workoutWriter.ts
    │   ├── intelligence/                    # Fase 2
    │   │   ├── readiness.ts
    │   │   ├── energyBalance.ts
    │   │   ├── weightTrend.ts
    │   │   ├── bodyCompAlerts.ts
    │   │   ├── dateUtils.ts
    │   │   └── ReadinessScreen.tsx
    │   ├── sync/                            # Fase 2
    │   │   ├── syncWorker.ts
    │   │   └── netInfo.ts
    │   ├── nutrition/                       # Fase 3
    │   │   ├── NutritionScreen.tsx
    │   │   ├── BarcodeScannerScreen.tsx
    │   │   ├── foodTemplates.ts             # 40+ alimentos precargados + combos
    │   │   ├── openFoodFactsClient.ts       # API gratuita sin clave + cache SQLite
    │   │   └── foodRepo.ts
    │   ├── entrenos/                        # Fase 3
    │   │   ├── WorkoutsScreen.tsx
    │   │   ├── PlateCalculator.tsx          # Visual discos por lado
    │   │   ├── HIITTimer.tsx                # + RestTimer
    │   │   ├── PostWorkoutSummary.tsx       # + MuscleHeatMap + SetStateTag
    │   │   └── doubleProgression.ts         # + deloadSuggester
    │   ├── calendar/CalendarScreen.tsx      # Fase 3
    │   ├── periodization/PeriodizationScreen.tsx  # Fase 3
    │   ├── mealPlanner/MealPlannerScreen.tsx      # Fase 3
    │   ├── recommendations/                 # Fase 3
    │   │   ├── recommendationEngine.ts      # Cruza readiness+calendario+heatmap+nutrición+cámara
    │   │   └── RecommendationsScreen.tsx
    │   ├── reminders/localNotifications.ts  # Fase 3: bridge + UI
    │   ├── audioCoach/audioCoach.ts         # Fase 3: bridge JS
    │   ├── widget/widgetBridge.ts           # Fase 3: bridge JS
    │   └── export/exportService.ts          # Fase 3: JSON + CSV
    ├── store/
    │   ├── workoutStore.ts
    │   └── settingsStore.ts
    └── theme/colors.ts
```

---

## Instrucciones EXACTAS para generar el .apk (Fase 3)

### 0. Requisitos
- Node 20+
- Java 17 (`java -version` debe dar 17.x)
- EAS CLI: `npm i -g eas-cli`
- Cuenta Expo: `eas login`
- Cuenta Supabase: https://supabase.com
- (Opcional) Android Studio con SDK 34 para builds locales

### 1. Instalar dependencias
```bash
cd all-in-one-fitness
npm install
```

### 2. Configurar Supabase
1. Crea proyecto en https://supabase.com
2. Project Settings → API: copia `Project URL` y `anon public key`
3. SQL Editor: pega **TODO** `supabase/schema.sql` y ejecuta
4. Copia `.env.example` a `.env` y rellena:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon-key...
   ```

### 3. Inicializar EAS
```bash
eas login
eas init
# Anota el projectId, reemplaza REPLACE_WITH_EAS_PROJECT_ID en app.config.ts
```

### 4. Prebuild nativo
```bash
npx expo prebuild --platform android --clean
```
Genera `android/` con Gradle, AndroidManifest, MainApplication.kt, etc.

### 5. Copiar archivos nativos al proyecto Android

```bash
# Crear directorios destino
mkdir -p android/app/src/main/java/com/aiofitness/{pose,audio,notifications,widget,sync}
mkdir -p android/app/src/main/res/{layout,drawable,raw,xml}
mkdir -p android/app/src/main/assets

# Copiar módulos nativos
cp android-native/PoseLandmarkerPlugin.kt \
   android/app/src/main/java/com/aiofitness/pose/PoseLandmarkerPlugin.kt
cp android-native/PoseLandmarkerPluginPackage.kt \
   android/app/src/main/java/com/aiofitness/pose/PoseLandmarkerPluginPackage.kt
cp android-native/SyncForegroundService.kt \
   android/app/src/main/java/com/aiofitness/sync/SyncForegroundService.kt
cp android-native/audio/AudioCoachModule.kt \
   android/app/src/main/java/com/aiofitness/audio/AudioCoachModule.kt
cp android-native/notifications/LocalNotificationsModule.kt \
   android/app/src/main/java/com/aiofitness/notifications/LocalNotificationsModule.kt
cp android-native/widget/FitnessWidgetProvider.kt \
   android/app/src/main/java/com/aiofitness/widget/FitnessWidgetProvider.kt
cp android-native/widget/WidgetDataStore.kt \
   android/app/src/main/java/com/aiofitness/widget/WidgetDataStore.kt

# Layouts y recursos del widget
cp android-native/widget/widget_fitness.xml \
   android/app/src/main/res/layout/widget_fitness.xml
cp android-native/widget/widget_bg.xml \
   android/app/src/main/res/drawable/widget_bg.xml

# Crear widget_info.xml
cat > android/app/src/main/res/xml/widget_info.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="180dp"
  android:minHeight="100dp"
  android:updatePeriodMillis="1800000"
  android:initialLayout="@layout/widget_fitness"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
EOF

# Crear beep.mp3 (tono corto)
# Opción A: descargar uno existente
curl -L -o android/app/src/main/res/raw/beep.mp3 \
  https://cdn.pixabay.com/audio/2022/03/15/audio_8b63d80d8c.mp3

# Opción B: generarlo con ffmpeg
# ffmpeg -f lavfi -i "sine=frequency=880:duration=0.1" -ac 2 android/app/src/main/res/raw/beep.mp3
```

### 6. Descargar modelo MediaPipe
```bash
curl -L -o android/app/src/main/assets/pose_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker/float16/1/pose_landmarker.task
```

### 7. Modificar AndroidManifest.xml

Abrir `android/app/src/main/AndroidManifest.xml` y dentro de `<application>` añadir:

```xml
<!-- Widget receiver -->
<receiver
  android:name="com.aiofitness.widget.FitnessWidgetProvider"
  android:exported="true">
  <intent-filter>
    <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    <action android:name="com.aiofitness.widget.ADD_WATER" />
    <action android:name="com.aiofitness.widget.OPEN_COACH" />
  </intent-filter>
  <meta-data
    android:name="android.appwidget.provider"
    android:resource="@xml/widget_info" />
</receiver>

<!-- ReminderReceiver -->
<receiver
  android:name="com.aiofitness.notifications.ReminderReceiver"
  android:exported="false" />
```

### 8. Modificar MainApplication.kt

Abrir `android/app/src/main/java/com/aiofitness/coach/MainApplication.kt` y:
1. Añadir imports:
   ```kotlin
   import com.aiofitness.pose.PoseLandmarkerPlugin
   import com.aiofitness.pose.PoseLandmarkerPluginPackage
   import com.mrousavy.camera.frameprocessor.VisionCameraProxy
   ```
2. En `getPackages()` añadir:
   ```kotlin
   add(PoseLandmarkerPluginPackage())
   ```
3. En `onCreate()` añadir (antes de `load()`):
   ```kotlin
   VisionCameraProxy.registerPlugin(
     PoseLandmarkerPlugin(this, visionCameraProxy)
   )
   ```

### 9. Verificar build.gradle (android/app)

`expo-build-properties` ya inyecta las dependencias desde `app.config.ts`. Si por alguna razón no se inyectan, añadir manualmente:

```gradle
dependencies {
  implementation "com.mrousavy:camera:4.5.2"
  implementation "com.google.mediapipe:tasks-vision:0.10.14"
  implementation "androidx.health.connect:connect-client:1.1.0-alpha02"
  implementation "androidx.work:work-runtime-ktx:2.9.0"
  implementation "androidx.appcompat:appcompat:1.6.1"
}
```

### 10. Compilar APK (perfil PRIORITARIO `preview`)

```bash
eas build --profile preview --platform android --non-interactive
```

- EAS sube el código, configura Gradle en la nube, y genera `.apk`.
- Duración estimada: 15-30 min la primera vez, 8-12 min en incrementales.
- Al terminar, EAS devuelve una URL de descarga del `.apk`.

### 11. Instalar en el teléfono
1. Descarga el `.apk` desde el link de EAS al móvil.
2. Pulsa "Instalar" (Android pedirá confirmación por ser fuera de Play Store).
3. Abre la app:
   - Concede permiso de cámara → entrena.
   - Pestaña Salud → concede Health Connect → sincroniza datos de Mi Fitness.
   - Pestaña Nutrición → usa plantillas o escanea barcode.
   - Long-press en home screen → Añadir widget → "All-in-One Fitness".
4. En Supabase Dashboard → Table Editor → `devices` debe aparecer tu deviceId.

### 12. (Opcional) Dev client para iterar
```bash
eas build --profile development --platform android
```
Útil para conectar Metro en local y probar cambios sin recompilar.

---

## Verificación post-instalación

| Pantalla | Qué debe pasar |
|---|---|
| **Coach AI** | Cámara + calibración 3s → esqueleto en tiempo real con VBT y asimetría L/R. Grabar serie → replay disponible. |
| **Readiness** | Score 0-100 con factores sueño/HR/fatiga + balance energético + tendencia peso + alertas composición. |
| **Salud** | HC instalado, permisos concedidos → datos de hoy (pasos, HR, kcal, sueño, peso, grasa, estrés) desde Mi Fitness. |
| **Entrenos** | Historial + herramientas (discos, HIIT, descanso, heatmap) + doble progresión sugerida + deload si aplica. |
| **Nutrición** | Macros hoy con barras de progreso + búsqueda de 40+ alimentos precargados + escáner barcode + agua con botones rápidos. |
| **Más** | Calendario mensual/semanal coloreado, periodización con metas, plan comidas 7x4 + lista de compras, recomendaciones IA, recordatorios locales. |
| **Widget home** | Muestra pasos/kcal/agua + botones "+250ml" y "Coach AI". |
| **Notificaciones** | Recordatorios locales llegan a la hora configurada sin internet. |
| **Audio coach** | Al contar reps o avisar fin de descanso, baja el volumen de Spotify/YouTube sin pausarlos. |
| **Supabase** | Tabla `devices` con tu deviceId; tras entrenos: filas en `workouts` y `sets`. |
| **Export** | Botón JSON/CSV en pantalla Export → comparte archivo vía WhatsApp/email/etc. |

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Build falla en MediaPipe | Modelo `pose_landmarker.task` no está en assets | Repasa paso 6 |
| Build falla en widget | Falta `widget_info.xml` o layouts en res/ | Repasa paso 5 |
| App crashea al abrir | MainApplication.kt sin registro del plugin | Repasa paso 8 |
| HC dice "No instalado" | Android 13 sin Play Services actualizado | Botón "Instalar desde Play Store" en pantalla Salud |
| Mi Fitness no aparece | Vincular reloj en Mi Fitness app primero | Abre Mi Fitness → vincula reloj/báscula → vuelve |
| Widget no aparece en home | Long-press home → Widgets → selecciona All-in-One Fitness | Tras añadir, esperá 30s al primer refresh |
| Recordatorios no llegan | POST_NOTIFICATIONS denegado en Android 13+ | Ajustes → All-in-One Fitness → Notificaciones → permitir |
| Audio coach no suena | TTS español no instalado o ducking roto | Ajustes → Idioma y entrada → Text-to-speech → instalar español |
| Supabase tablas vacías | deviceId no registrado o .env mal | Revisa warnings en consola EAS |
| LeanBodyMass "_derived" | HC sin tipos avanzados (Android 13-) | Esperado; lo calculamos de Weight+BodyFat |
| Build release falla ProGuard | Reglas no aplicadas | Verificar `android-native/proguard-rules.pro` copiado en `android/app/proguard-rules.pro` |

## Build profiles disponibles

```bash
# APK release instalable directo en teléfono (SIN Metro, SIN Play Store)
eas build --profile preview --platform android

# Dev client: para iterar con Metro en local
eas build --profile development --platform android

# App Bundle para Play Store (cuando publiques)
eas build --profile production --platform android
```

---

## Roadmap (todo lo entregado)

### Fase 1 ✓
- Arquitectura + DB schema SQLite offline-first
- Biomecánica: landmarks, angle2D/3D/signed, torso inclination
- Máquina de estados de reps con histéresis + ROM + tempo
- Detección de fallos: valgo, depth, torso lean, balanceo, elbow forward, arqueo
- Plugin Kotlin MediaPipe PoseLandmarker (GPU delegate)
- Overlay Skia con puntitos color por fase
- Calibración 3s + HUD alto contraste
- Tema oscuro alto contraste

### Fase 2 ✓
- Backend Supabase con RLS por deviceId
- Sync worker upload-only con foreground service
- Health Connect: steps, HR reposo/entreno, kcal activa/basal, sueño, estrés, body composition completa (S400)
- Source filter Mi Fitness > Google Fit
- Writer ExerciseSessionRecord a HC
- Inteligencia Cruzada: Readiness, Energy Balance, Weight Trend, BodyComp Alerts
- Sync_queue + backoff exponencial

### Fase 3 ✓
- Cámara: VBT por esqueleto, asimetría L/R, ghost pacer (replay + live indicator), grabación serie con rep_markers, guía espacio reducido
- Audio coach con ducking (AudioFocus MAY_DUCK + TTS español)
- Nutrición: 40+ alimentos precargados + combos, escáner barcode (VisionCamera + Open Food Facts + cache SQLite), agua + suplementos, comparativa visual
- Entrenos: plate calculator visual, HIIT intervals, rest timer activo/pasivo, tags 1-tap (Limpia/Al límite/Molestia/Faltó energía), doble progresión automática, sugerencia de Deload, mapa de calor muscular 7 días, post-workout summary con distribución por grupo
- Calendario mensual/semanal coloreado por cumplimiento + planificación futura
- Periodización: ciclos X semanas (déficit/recomp/volumen/mantenimiento) con metas semanales
- Planificador semanal de comidas 7x4 + lista de compras auto-generada
- Motor de recomendaciones IA cruzando readiness + calendario + heatmap + nutrición + cámara + tags molestia
- Recordatorios locales (AlarmManager, sin internet)
- Widget Android home-screen (informativo + acciones: +250ml agua, abrir Coach)
- Export JSON/CSV (workout puntual + backup completo por tabla)
- Deep linking (aiofitness://coach, //addwater/250, etc.)

## Seguridad

- **deviceId-based RLS**: cada dispositivo solo ve sus propios datos. Sin Auth en Fase 3 (prioridad: probar el APK rápido).
- **Para producción**: migrar a Supabase Auth + JWT en Fase 4+.
- **API keys**: `EXPO_PUBLIC_SUPABASE_ANON_KEY` se incrusta en el APK y es visible por reverse engineering. RLS protege los datos; la anon key no permite bypass de RLS.

## Licencia

Privado. Uso personal del equipo de desarrollo.
