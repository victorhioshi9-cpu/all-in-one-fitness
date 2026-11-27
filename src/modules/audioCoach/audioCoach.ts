/**
 * audioCoach.ts
 * ----------------------------------------------------------------------------
 * Wrapper JS sobre AudioCoachModule.kt.
 * - speak(text): TTS español con ducking automático de música.
 * - beep(): tono corto para conteo.
 * - setEnabled / setVoicePitch: ajustes.
 */
import { NativeModules, Platform } from "react-native";

const AudioCoach = NativeModules.AudioCoach;

let enabled = true;

export const audioCoach = {
  /** Habla el texto. baja el volumen de la música durante el speech. */
  async speak(text: string, urgent = false): Promise<boolean> {
    if (!enabled) return false;
    if (Platform.OS !== "android" || !AudioCoach) return false;
    try {
      return await AudioCoach.speak(text, urgent);
    } catch (err) {
      console.warn("[audioCoach] speak failed:", err);
      return false;
    }
  },

  /** Beep discreto. */
  async beep(freqHz = 880, durationMs = 100): Promise<boolean> {
    if (!enabled) return false;
    if (Platform.OS !== "android" || !AudioCoach) return false;
    try {
      return await AudioCoach.beep(freqHz, durationMs);
    } catch (err) {
      console.warn("[audioCoach] beep failed:", err);
      return false;
    }
  },

  setEnabled(value: boolean) {
    enabled = value;
    if (Platform.OS === "android" && AudioCoach) {
      AudioCoach.setEnabled(value);
    }
  },

  async setVoicePitch(pitch: number) {
    if (Platform.OS === "android" && AudioCoach) {
      await AudioCoach.setVoicePitch(pitch);
    }
  },

  async stop() {
    if (Platform.OS === "android" && AudioCoach) {
      await AudioCoach.stop();
    }
  }
};
