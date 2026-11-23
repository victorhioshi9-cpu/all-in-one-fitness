/**
 * settingsStore.ts - Preferencias del usuario.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  keepScreenAwake: boolean;
  voiceCoach: boolean;
  audioTones: boolean;
  accidentalTouchGuard: boolean;
  exportFormat: "json" | "csv";
  loadFromStorage: () => Promise<void>;
  toggle: (key: keyof Omit<SettingsState, "loadFromStorage" | "toggle" | "exportFormat" | "setExport">) => void;
  setExport: (f: "json" | "csv") => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keepScreenAwake: true,
  voiceCoach: true,
  audioTones: true,
  accidentalTouchGuard: true,
  exportFormat: "json",

  loadFromStorage: async () => {
    const raw = await AsyncStorage.getItem("aio_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      set(parsed);
    }
  },

  toggle: (key) => {
    const next = { ...get(), [key]: !get()[key] } as any;
    set({ [key]: next[key] } as any);
    AsyncStorage.setItem("aio_settings", JSON.stringify({
      keepScreenAwake: next.keepScreenAwake,
      voiceCoach: next.voiceCoach,
      audioTones: next.audioTones,
      accidentalTouchGuard: next.accidentalTouchGuard,
      exportFormat: next.exportFormat
    }));
  },

  setExport: (f) => {
    set({ exportFormat: f });
    AsyncStorage.setItem("aio_settings", JSON.stringify({ ...get(), exportFormat: f }));
  }
}));
