package com.aiofitness.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Log
import androidx.camera.core.ImageProxy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.mrousavy.camera.frameprocessor.Frame
import com.mrousavy.camera.frameprocessor.FrameProcessorPlugin
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicReference

/**
 * PoseLandmarkerPlugin
 * ----------------------------------------------------------------------------
 * Plugin nativo de VisionCamera (v4) que invoca MediaPipe PoseLandmarker sobre
 * cada frame de la cámara y devuelve los 33 landmarks al hilo JS en el formato
 * esperado por [usePoseFrameProcessor.ts] y [SkeletonOverlay.tsx].
 *
 * Registro: se carga vía [PoseLandmarkerPluginPackage] + `VisionCameraProxy.registerPlugin`
 * desde MainApplication.kt (lo hace automáticamente el config plugin `with-native-pose.js`).
 *
 * - Modelo: `assets/pose_landmarker.task` (descargado en prebuild).
 * - Delegate: GPU si está disponible, si no CPU.
 * - Running mode: LIVE_STREAM con callback async para no bloquear el frame processor.
 * - Formato de salida (WritableMap):
 *     {
 *       detected: Boolean,
 *       timestampMs: Double,
 *       landmarks: [
 *         { x: Double, y: Double, z: Double, v: Double, p: Double }, ...  // 33 entries
 *       ],
 *       worldLandmarks: [ ... ]   // mismo formato, coords en metros relativas a cadera
 *     }
 *
 * Nota: el plugin es stateless a nivel de invocación; el PoseLandmarker subyacente
 * se crea perezosamente en el primer frame y se cachea en un AtomicReference para
 * thread-safety (VisionCamera puede llamar al callback desde diferentes hilos).
 */
class PoseLandmarkerPlugin(private val context: Context) : FrameProcessorPlugin("poseLandmarker") {

  companion object {
    private const val TAG = "PoseLandmarkerPlugin"
    private const val MODEL_PATH = "pose_landmarker.task"
    private const val MIN_DETECTION_CONFIDENCE = 0.5f
    private const val MIN_TRACKING_CONFIDENCE = 0.5f
    private const val MIN_PRESENCE_CONFIDENCE = 0.5f
    private const val NUM_POSES = 1
  }

  // PoseLandmarker es thread-safe para detección pero la creación es costosa.
  // Lo inicializamos lazy y lo cacheamos; el AtomicReference protege la asignación.
  private val landmarkerRef = AtomicReference<PoseLandmarker?>(null)
  // ReusableBitmap para no hacer alloc en cada frame (mediaPipe no retiene la imagen
  // tras detect(); es seguro reutilizar siempre que llamemos a detect() síncrono).
  @Volatile private var lastBitmap: Bitmap? = null

  /** Crea (lazy) o devuelve el PoseLandmarker cacheado. */
  @Synchronized
  private fun getOrCreateLandmarker(): PoseLandmarker? {
    landmarkerRef.get()?.let { return it }
    return try {
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath(MODEL_PATH)
        .setDelegate(try {
          // Preferimos GPU. Si la dispositivo no tiene soporte, MediaPipe lanzará
          // y capturamos abajo para caer a CPU.
          Delegate.GPU
        } catch (e: NoClassDefFoundError) {
          Delegate.CPU
        })
        .build()

      val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.LIVE_STREAM)
        .setNumPoses(NUM_POSES)
        .setMinPoseDetectionConfidence(MIN_DETECTION_CONFIDENCE)
        .setMinPosePresenceConfidence(MIN_PRESENCE_CONFIDENCE)
        .setMinTrackingConfidence(MIN_TRACKING_CONFIDENCE)
        .setResultListener { result, _ ->
          // ResultListener se invoca en el hilo de MediaPipe. Guardamos el último
          // resultado para que callback() lo consuma síncrono en el hilo del frame.
          lastResultRef.set(result)
        }
        .setErrorListener { error ->
          Log.e(TAG, "MediaPipe error: ${error.message}")
        }
        .build()

      val landmarker = PoseLandmarker.createFromOptions(context, options)
      landmarkerRef.set(landmarker)
      Log.i(TAG, "PoseLandmarker creado OK (delegate=${if (isGpu) "GPU" else "CPU"})")
      landmarker
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo crear PoseLandmarker (GPU falló, intentando CPU)", e)
      try {
        val baseOptions = BaseOptions.builder()
          .setModelAssetPath(MODEL_PATH)
          .setDelegate(Delegate.CPU)
          .build()
        val options = PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(baseOptions)
          .setRunningMode(RunningMode.LIVE_STREAM)
          .setNumPoses(NUM_POSES)
          .setMinPoseDetectionConfidence(MIN_DETECTION_CONFIDENCE)
          .setMinPosePresenceConfidence(MIN_PRESENCE_CONFIDENCE)
          .setMinTrackingConfidence(MIN_TRACKING_CONFIDENCE)
          .setResultListener { result, _ -> lastResultRef.set(result) }
          .setErrorListener { error -> Log.e(TAG, "MediaPipe error (CPU): ${error.message}") }
          .build()
        val landmarker = PoseLandmarker.createFromOptions(context, options)
        landmarkerRef.set(landmarker)
        Log.i(TAG, "PoseLandmarker creado OK con CPU fallback")
        landmarker
      } catch (e2: Throwable) {
        Log.e(TAG, "PoseLandmarker CPU fallback también falló", e2)
        null
      }
    }
  }

  private val isGpu: Boolean
    get() = try { Delegate.GPU; true } catch (e: NoClassDefFoundError) { false }

  // Cache del último resultado de MediaPipe (llamada async vía ResultListener).
  private val lastResultRef = AtomicReference<PoseLandmarkerResult?>(null)
  // Timestamp del último frame enviado a MediaPipe (para detectar frames descartados).
  @Volatile private var lastSentTimestampMs: Long = -1L

  /**
   * Callback principal invocado por VisionCamera por cada frame.
   * Debe terminar rápido (< 16 ms idealmente) para no perder FPS en el preview.
   */
  override fun callback(frame: Frame, params: ReadableMap): Any? {
    val landmarker = getOrCreateLandmarker() ?: run {
      // Si no hay landmarker (p.ej. modelo no encontrado), devolvemos "no detectado"
      // en lugar de crashear, para que la app siga abierta.
      return buildEmptyResult(System.currentTimeMillis())
    }

    val timestampMs = frame.timestamp.coerceAtLeast(0L)
    if (timestampMs == lastSentTimestampMs) {
      // Frame duplicado (a veces VisionCamera envía el mismo ts en secuencias rápidas)
      return lastResultRef.get()?.let { buildResultMap(it, timestampMs) } ?: buildEmptyResult(timestampMs)
    }
    lastSentTimestampMs = timestampMs

    val mpImage = try {
      frameToMpImage(frame)
    } catch (e: Throwable) {
      Log.w(TAG, "frameToMpImage failed: ${e.message}")
      return buildEmptyResult(timestampMs)
    }

    try {
      // detectAsync en modo LIVE_STREAM dispara el ResultListener en background.
      landmarker.detectAsync(mpImage, timestampMs)
    } catch (e: Throwable) {
      Log.w(TAG, "detectAsync failed: ${e.message}")
      return buildEmptyResult(timestampMs)
    }

    // Devolvemos el último resultado disponible (puede ser del frame previo).
    // Esto introduce ~1 frame de latencia pero mantiene 60 fps en el overlay.
    val result = lastResultRef.get()
    return if (result != null) buildResultMap(result, timestampMs) else buildEmptyResult(timestampMs)
  }

  /**
   * Convierte un Frame de VisionCamera (YUV_420_888 normalmente) en un MPImage
   * basado en Bitmap. Usamos YuvImage + BitmapFactory para no depender de RenderScript
   * (deprecated en API 31+).
   */
  private fun frameToMpImage(frame: Frame): MPImage {
    val image = frame.image
    val width = image.width
    val height = image.height

    // 1) YUV -> NV21 -> JPEG -> Bitmap
    val nv21 = yuv420ToNv21(image, width, height)
    val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
    val out = ByteArrayOutputStream()
    yuvImage.compressToJpeg(Rect(0, 0, width, height), 90, out)
    val jpegBytes = out.toByteArray()
    var bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
      ?: throw IOException("BitmapFactory.decodeByteArray returned null")

    // 2) Rotar el bitmap según la orientación del frame (VisionCamera ya da la rotación
    //    corregida en portrait). Por defecto el sensor trasero da frames landscape;
    //    VisionCamera aplica la rotación correcta en frame.orientation pero a veces
    //    hace falta un giro manual.
    val rotationDegrees = frame.orientation?.toFloat() ?: 0f
    if (rotationDegrees != 0f) {
      val matrix = Matrix().apply { postRotate(rotationDegrees) }
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated != bitmap) {
        bitmap.recycle()
        bitmap = rotated
      }
    }

    // 3) Bitmap -> MPImage (copia interna gestionada por MediaPipe)
    return BitmapImageBuilder(bitmap).build()
  }

  /** Combina los 3 planos YUV_420_888 en un buffer NV21 contiguo. */
  private fun yuv420ToNv21(image: android.media.Image, width: Int, height: Int): ByteArray {
    val ySize = width * height
    val uvSize = ySize / 2
    val nv21 = ByteArray(ySize + uvSize)

    // Y plane
    val yBuffer = image.planes[0].buffer
    val uBuffer = image.planes[1].buffer
    val vBuffer = image.planes[2].buffer

    val yRowStride = image.planes[0].rowStride
    val uvRowStride = image.planes[1].rowStride
    val uvPixelStride = image.planes[1].pixelStride

    // Copia Y
    var pos = 0
    if (yRowStride == width) {
      yBuffer.get(nv21, 0, ySize)
      pos = ySize
    } else {
      var row = 0
      while (row < height) {
        yBuffer.position(row * yRowStride)
        yBuffer.get(nv21, pos, width)
        pos += width
        row++
      }
    }

    // Copia VU intercalado
    if (uvRowStride == width / 2 && uvPixelStride == 2) {
      // Caso óptimo: VU ya está intercalado contiguo
      val vuBuffer = vBuffer
      vuBuffer.get(nv21, ySize, uvSize)
    } else {
      // Caso general: copia pixel a pixel
      var uvPos = ySize
      val uvHeight = height / 2
      val uvWidth = width / 2
      val uRowStrideAbs = if (uBuffer.remaining() >= uvWidth * uvHeight) uvRowStride else uvWidth * uvPixelStride
      var row = 0
      while (row < uvHeight) {
        var col = 0
        while (col < uvWidth) {
          val vIdx = row * uvRowStride + col * uvPixelStride
          val uIdx = row * uvRowStride + col * uvPixelStride
          if (vIdx < vBuffer.limit()) nv21[uvPos++] = vBuffer.get(vIdx)
          if (uIdx < uBuffer.limit()) nv21[uvPos++] = uBuffer.get(uIdx)
          col++
        }
        row++
      }
    }
    return nv21
  }

  /** Construye el WritableMap esperado por JS cuando hay detección exitosa. */
  private fun buildResultMap(result: PoseLandmarkerResult, timestampMs: Long): WritableMap {
    val map = WritableNativeMap()
    val poses = result.landmarks()
    if (poses == null || poses.isEmpty()) {
      return buildEmptyResult(timestampMs)
    }
    val firstPose = poses[0]
    map.putBoolean("detected", firstPose.isNotEmpty())
    map.putDouble("timestampMs", timestampMs.toDouble())

    val landmarksArr: WritableArray = WritableNativeArray()
    for (lm in firstPose) {
      val l = WritableNativeMap()
      l.putDouble("x", lm.x().toDouble())
      l.putDouble("y", lm.y().toDouble())
      l.putDouble("z", lm.z().toDouble())
      l.putDouble("v", lm.visibility().orElse(0f).toDouble())
      l.putDouble("p", lm.presence().orElse(0f).toDouble())
      landmarksArr.pushArray(l)
    }
    map.putArray("landmarks", landmarksArr)

    val worldPoses = result.worldLandmarks()
    if (worldPoses != null && worldPoses.isNotEmpty()) {
      val worldArr: WritableArray = WritableNativeArray()
      for (lm in worldPoses[0]) {
        val l = WritableNativeMap()
        l.putDouble("x", lm.x().toDouble())
        l.putDouble("y", lm.y().toDouble())
        l.putDouble("z", lm.z().toDouble())
        l.putDouble("v", lm.visibility().orElse(0f).toDouble())
        l.putDouble("p", lm.presence().orElse(0f).toDouble())
        worldArr.pushArray(l)
      }
      map.putArray("worldLandmarks", worldArr)
    }
    return map
  }

  /** Resultado vacío (no detection). No lanza excepción. */
  private fun buildEmptyResult(timestampMs: Long): WritableMap {
    val map = WritableNativeMap()
    map.putBoolean("detected", false)
    map.putDouble("timestampMs", timestampMs.toDouble())
    map.putArray("landmarks", Arguments.createArray())
    return map
  }
}
