package com.aiofitness.pose

import android.app.Application
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessor.VisionCameraProxy

/**
 * PoseLandmarkerPluginPackage
 * ----------------------------------------------------------------------------
 * ReactPackage vacío. Su único propósito es forzar a React Native a cargar la
 * clase [PoseLandmarkerPlugin] para que el bloque estático `static { ... }` de
 * abajo registre el plugin en VisionCameraProxy.
 *
 * Si VisionCameraProxy.registerPlugin fallase (p.ej. clase no encontrada en
 * esta versión de la librería), lo capturamos y logueamos; la app sigue
 * arrancando pero el frame processor devolverá "no detectado".
 *
 * Este package debe añadirse en MainApplication.getPackages() (lo hace el
 * config plugin automáticamente en `with-native-pose.js`).
 */
class PoseLandmarkerPluginPackage : ReactPackage {

  companion object {
    @Volatile private var registered = false
    private const val TAG = "PoseLandmarkerPkg"

    /**
     * Llamar desde MainApplication.onCreate() (lo hace with-native-pose.js
     * insertando código en onCreate).
     */
    @JvmStatic
    fun registerIfNeeded(application: Application) {
      if (registered) return
      synchronized(this) {
        if (registered) return
        try {
          val plugin = PoseLandmarkerPlugin(application.applicationContext)
          VisionCameraProxy.registerPlugin(plugin)
          registered = true
          android.util.Log.i(TAG, "PoseLandmarkerPlugin registrado en VisionCameraProxy")
        } catch (t: Throwable) {
          android.util.Log.e(
            TAG,
            "No se pudo registrar PoseLandmarkerPlugin: ${t.javaClass.simpleName} - ${t.message}",
            t
          )
        }
      }
    }
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    emptyList()

  override fun getViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
