# ============================================================================
# assets/README.md - Dónde colocar el modelo MediaPipe
# ============================================================================
# El modelo `pose_landmarker.task` (~10MB) debe descargarse una sola vez y
# colocarse en `android/app/src/main/assets/pose_landmarker.task`.
#
# URL de descarga oficial (float16, 1/1):
#   https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker/float16/1/pose_landmarker.task
#
# En build de producción se recomienda empaquetarlo en assets/ para no
# depender de red. En dev build se puede descargar bajo demanda.
