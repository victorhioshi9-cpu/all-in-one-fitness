/**
 * supabaseClient.ts
 * ----------------------------------------------------------------------------
 * Cliente Supabase singleton NULL-SAFE.
 *
 * Si EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY no están
 * configuradas, getSupabase() devuelve null y la app arranca en modo
 * offline-only (sin cloud sync). Esto evita el crash "supabaseUrl is required"
 * que lanza @supabase/supabase-js v2 cuando se le pasa "".
 *
 * Para activar cloud sync más tarde:
 *   1. Crea un proyecto en https://supabase.com
 *   2. Ejecuta supabase/schema.sql en el SQL Editor
 *   3. Añade EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
 *      como GitHub secrets y pásalos al workflow como env vars antes del build.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { getDeviceId, getCachedDeviceId } from "./deviceIdentity";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!SUPABASE_CONFIGURED) {
  console.warn(
    "[supabase] Variables EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY no configuradas. " +
    "La app arrancará en modo offline-only. Para activar cloud sync, configura .env o GitHub secrets."
  );
}

let _client: SupabaseClient | null = null;
let _contextReady = false;

/**
 * Devuelve el cliente Supabase, o null si no está configurado.
 * Crea el cliente la primera vez (con deviceId inyectado en headers).
 */
export async function getSupabase(): Promise<SupabaseClient | null> {
  // Modo offline: no se crea ningún cliente.
  if (!SUPABASE_CONFIGURED) return null;

  if (_client) {
    await ensureDeviceContext();
    return _client;
  }
  const deviceId = await getDeviceId();

  _client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    global: {
      headers: {
        "x-device-id": deviceId
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    realtime: { enabled: false }
  });

  await ensureDeviceContext();
  return _client;
}

/**
 * Llama a la RPC `set_device_context(deviceId)` para activar las RLS policies.
 * Best-effort: si falla, solo logueamos (no bloquea el arranque).
 */
async function ensureDeviceContext(): Promise<void> {
  if (_contextReady || !_client) return;
  const deviceId = getCachedDeviceId();
  try {
    await _client.rpc("set_device_context", { p_device_id: deviceId });
    _contextReady = true;
  } catch (err) {
    console.warn("[supabase] set_device_context falló:", err);
  }
}

/**
 * Registra el dispositivo en la tabla `devices` (upsert).
 * Best-effort: si no hay cliente o la RPC falla, no rompe el flujo.
 */
export async function pingDevicePresence(): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  try {
    await supabase.rpc("register_device", {
      p_device_id: getCachedDeviceId(),
      p_app_version: Application.nativeApplicationVersion ?? "0.0.0",
      p_os_version: Platform.Version?.toString() ?? "unknown",
      p_model: Platform.constants?.Brand
        ? `${Platform.constants.Brand} ${Platform.constants.Model}`
        : "unknown"
    });
  } catch (err) {
    console.warn("[supabase] pingDevicePresence falló:", err);
  }
}
