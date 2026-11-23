/**
 * supabaseClient.ts
 * ----------------------------------------------------------------------------
 * Cliente Supabase singleton.
 * - Lee URL y anon key de variables `EXPO_PUBLIC_*` (EAS las inyecta en build).
 * - Inyecta el header `x-device-id` en cada request vía el cliente fetch.
 * - Llama a `set_device_context` RPC antes del primer upsert para activar RLS.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDeviceId, getCachedDeviceId } from "./deviceIdentity";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabase] Variables EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY no configuradas. " +
    "Copia .env.example a .env y rellénalas."
  );
}

let _client: SupabaseClient | null = null;
let _contextReady = false;

/**
 * Devuelve el cliente Supabase. Crea uno nuevo si no existe.
 * El deviceId se obtiene de forma lazy (puede ser async la 1ª vez).
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (_client) {
    await ensureDeviceContext();
    return _client;
  }
  const deviceId = await getDeviceId();

  _client = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: {
      headers: {
        "x-device-id": deviceId
      }
    },
    auth: {
      // Sin persistencia ni auto-refresh de sesión: no usamos Auth en Fase 2.
      persistSession: false,
      autoRefreshToken: false
    },
    // El sync worker hace batches: desactivamos el fetcher en tiempo real
    // para no abrir websockets innecesarios.
    realtime: { enabled: false }
  });

  await ensureDeviceContext();
  return _client;
}

/**
 * Llama a la RPC `set_device_context(deviceId)` para activar las RLS policies.
 * Se ejecuta una sola vez por sesión del cliente.
 */
async function ensureDeviceContext(): Promise<void> {
  if (_contextReady || !_client) return;
  const deviceId = getCachedDeviceId();
  try {
    await _client.rpc("set_device_context", { p_device_id: deviceId });
    _contextReady = true;
  } catch (err) {
    // No rompemos el flujo: las RLS permitirán SELECT/INSERT aunque el contexto
    // no esté seteado (políticas `using (true)`), pero el filtrado por deviceId
    // no funcionará hasta que set_device_context se ejecute.
    console.warn("[supabase] set_device_context falló:", err);
  }
}

/**
 * Registra el dispositivo en la tabla `devices` (upsert).
 * Se invoca al arrancar la app y después de cada sync exitosa para refrescar
 * `last_seen_at`.
 */
export async function pingDevicePresence(): Promise<void> {
  const supabase = await getSupabase();
  const { Application } = require("expo-application");
  const { Platform } = require("react-native");
  await supabase.rpc("register_device", {
    p_device_id: getCachedDeviceId(),
    p_app_version: Application.nativeApplicationVersion ?? "0.0.0",
    p_os_version: Platform.Version?.toString() ?? "unknown",
    p_model: Platform.constants?.Brand
      ? `${Platform.constants.Brand} ${Platform.constants.Model}`
      : "unknown"
  });
}
