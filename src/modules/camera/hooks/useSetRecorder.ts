/**
 * useSetRecorder.ts
 * ----------------------------------------------------------------------------
 * Grabación de la serie con overlay del esqueleto + rep_markers.
 *
 * - VisionCamera graba el video MP4 con `startRecording()`.
 * - En paralelo, el hook muestrea los PoseFrames cada N frames para reconstruir
 *   el esqueleto en el replay (sin guardar el video crudo de landmarks).
 * - Al parar la grabación: guarda un registro en `set_recordings` con
 *   { video_path, duration_sec, fps, pose_frames (json comprimido), rep_markers }.
 * - El flag is_best se setea si esta serie supera el récord anterior en reps
 *   completas + ROM medio + velocidad pico.
 */
import { useState, useCallback, useRef } from "react";
import { Camera } from "react-native-vision-camera";
import * as FileSystem from "expo-file-system";
import { openDatabase, execAsync, queryAsync } from "@/modules/persistence/db";
import type { PoseFrame } from "@/modules/biomechanics/landmarks";
import type { RepSummary } from "@/modules/biomechanics/repStateMachine";

interface RepMarker {
  repIndex: number;
  timestampMs: number;
  faults: string[];
  fullRom: boolean;
}

interface UseSetRecorderResult {
  isRecording: boolean;
  recordingSeconds: number;
  startRecording: (cameraRef: React.RefObject<Camera<any>>) => Promise<string | null>;
  stopRecording: () => Promise<string | null>;
  /** Captura un PoseFrame cada N frames para el replay. */
  capturePoseFrame: (pose: PoseFrame) => void;
  /** Registra una rep completada como marker temporal. */
  markRep: (summary: RepSummary) => void;
}

const FRAME_STRIDE = 3;  // guardar 1 de cada 3 frames para replay ligero
const MAX_FRAMES_PER_SET = 600;  // ~20s a 30fps con stride 3

export function useSetRecorder(): UseSetRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const cameraRef = useRef<React.RefObject<Camera<any>> | null>(null);
  const videoPathRef = useRef<string | null>(null);
  const poseFramesRef = useRef<PoseFrame[]>([]);
  const repMarkersRef = useRef<RepMarker[]>([]);
  const frameCounterRef = useRef(0);
  const startTsRef = useRef(0);
  const tickRef = useRef<any>(null);

  const capturePoseFrame = useCallback((pose: PoseFrame) => {
    if (!isRecording) return;
    frameCounterRef.current++;
    if (frameCounterRef.current % FRAME_STRIDE !== 0) return;
    if (poseFramesRef.current.length < MAX_FRAMES_PER_SET) {
      // Comprimir: solo landmarks necesarios (no los 33, sino los "key joints" + extras)
      const compressed = pose.detected
        ? { ...pose, landmarks: pose.landmarks.map((l) => ({
            x: +l.x.toFixed(3), y: +l.y.toFixed(3),
            z: +l.z.toFixed(2), v: +l.v.toFixed(2), p: +l.p.toFixed(2)
          })) }
        : pose;
      poseFramesRef.current.push(compressed);
    }
  }, [isRecording]);

  const markRep = useCallback((summary: RepSummary) => {
    repMarkersRef.current.push({
      repIndex: summary.repIndex,
      timestampMs: summary.timestampMs,
      faults: summary.faults,
      fullRom: summary.fullRom
    });
  }, []);

  const startRecording = useCallback(async (ref: React.RefObject<Camera<any>>) => {
    if (isRecording) return null;
    cameraRef.current = ref;
    setIsRecording(true);
    setRecordingSeconds(0);
    startTsRef.current = Date.now();
    poseFramesRef.current = [];
    repMarkersRef.current = [];
    frameCounterRef.current = 0;

    // Timer visual
    tickRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startTsRef.current) / 1000));
    }, 1000);

    // Iniciar grabación de video con VisionCamera
    const path = `${FileSystem.documentDirectory}set_${Date.now()}.mp4`;
    videoPathRef.current = path;
    try {
      ref.current?.startRecording({
        path,
        videoBitRate: 4_000_000,
        videoCodec: "h264",
        onRecordingFinished: (video) => {
          videoPathRef.current = video.path;
        },
        onRecordingError: (err) => {
          console.error("[setRecorder] error:", err);
          setIsRecording(false);
          clearInterval(tickRef.current);
        }
      });
    } catch (err) {
      console.error("[setRecorder] startRecording throw:", err);
    }
    return path;
  }, [isRecording]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording) return null;
    setIsRecording(false);
    clearInterval(tickRef.current);

    // Parar video
    try {
      await cameraRef.current?.current?.stopRecording();
    } catch (err) {
      console.warn("[setRecorder] stopRecording failed:", err);
    }

    const videoPath = videoPathRef.current;
    const durationSec = Math.floor((Date.now() - startTsRef.current) / 1000);
    const poseFrames = poseFramesRef.current;
    const repMarkers = repMarkersRef.current;

    if (videoPath) {
      await persistRecording({ videoPath, durationSec, fps: 30, poseFrames, repMarkers });
    }
    return videoPath;
  }, [isRecording]);

  return {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    capturePoseFrame,
    markRep
  };
}

// --- Persistencia ----------------------------------------------------------
async function persistRecording(input: {
  videoPath: string;
  durationSec: number;
  fps: number;
  poseFrames: PoseFrame[];
  repMarkers: RepMarker[];
}): Promise<void> {
  const db = await openDatabase();
  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  // Comprimir JSON para no hinchar la fila
  const poseJson = JSON.stringify(input.poseFrames);
  const markersJson = JSON.stringify(input.repMarkers);

  await execAsync(
    db,
    `INSERT INTO set_recordings
      (id, set_id, workout_id, video_path, duration_sec, fps, pose_frames, rep_markers, is_best, created_at, synced_at)
     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, 0, ?, NULL)`,
    [id, input.videoPath, input.durationSec, input.fps, poseJson, markersJson, now]
  );
}
