/**
 * deviceIdentity.ts
 * ----------------------------------------------------------------------------
 * Genera y persiste un deviceId único por instalación física.
 * - Se construye a partir de: Android ID + app installation UUID.
 * - Se guarda en expo-secure-store (cifrado hardware-backed en Android).
 * - Lo manda el cliente Supabase en cada upsert para activar las RLS policies.
 *
 * Seguridad (nota para Fase 3):
 *   Sin Auth, este deviceId es la única prueba de identidad. Si alguien lo
 *   captura puede leer/escribir tus datos en Supabase. Para producción
 *   hay que migrar a Supabase Auth + JWT.
 */
import * as SecureStore from "expo-secure-store";
import * as Application from "expo-application";
import { Platform } from "react-native";

const KEY = "aio_device_id_v1";

let cachedId: string | null = null;

/**
 * Devuelve el deviceId, creándolo la primera vez.
 * Es síncrono si ya está cacheado (caso normal tras el primer arranque).
 */
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;

  let stored = await SecureStore.getItemAsync(KEY);
  if (!stored) {
    // Combinamos Android ID (estable por instalación) + un UUID aleatorio
    // para tener entropía suficiente incluso si el Android ID cambia tras reset.
    const androidId = (Application.androidId as string | undefined) ?? "";
    const random = generateUuidV4();
    stored = androidId
      ? `${androidId}-${random}`
      : `dev-${random}`;
    await SecureStore.setItemAsync(KEY, stored, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }
  cachedId = stored;
  return stored;
}

/** Versión síncrona para usar después del primer getDeviceId(). */
export function getCachedDeviceId(): string {
  if (!cachedId) {
    throw new Error("deviceIdentity no inicializado. Llama a getDeviceId() primero.");
  }
  return cachedId;
}

export async function initDeviceIdentity(): Promise<void> {
  await getDeviceId();
}

/** Devuelve metadata del dispositivo para enviarla al backend. */
export async function getDeviceMeta() {
  const deviceId = await getDeviceId();
  return {
    deviceId,
    appVersion: Application.nativeApplicationVersion ?? "0.0.0",
    osVersion: Platform.Version?.toString() ?? "unknown",
    model: Platform.constants?.Brand
      ? `${Platform.constants.Brand} ${Platform.constants.Model}`
      : "unknown"
  };
}

// --- Helper: UUID v4 sin depender de polyfill ------------------------------
function generateUuidV4(): string {
  // crypto.getRandomValues está disponible en RN heredando de lib DOM
  const bytes = new Uint8Array(16);
  // @ts-ignore - RN runtime expone globalThis.crypto
  (globalThis.crypto ?? require("react-native").crypto)?.getRandomValues?.(bytes);
  // Fallback: Math.random
  if (!bytes.some((b) => b !== 0)) {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
