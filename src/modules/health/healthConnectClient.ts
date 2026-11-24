/**
 * healthConnectClient.ts
 * ----------------------------------------------------------------------------
 * Wrapper sobre `react-native-health-connect` v3.2.
 *
 * Responsabilidades:
 *   - Verificar si Health Connect está disponible (getSdkStatus).
 *   - Ofrecer un deep link directo a la ficha de Play Store para instalarlo.
 *   - Inicializar el SDK y pedir permisos de lectura/escritura.
 *   - Abrir la pantalla de gestión de permisos de HC.
 *
 * Consideraciones Android:
 *   - Health Connect viene preinstalado en Android 14+.
 *   - En Android 13 y anteriores hay que instalar el módulo desde Play Store.
 *   - El deep link correcto es:
 *       market://details?id=com.google.android.apps.healthdata
 *     o en navegadores: https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata
 *
 * API v3.2:
 *   - getSdkStatus() devuelve un número (3 = SDK_AVAILABLE).
 *   - requestPermission() toma UN solo array de Permission { accessType, recordType }.
 *   - Devuelve el subconjunto de Permission granted.
 *   - No existe isHealthConnectAvailable ni PermissionResult.
 */
import { Linking, Platform } from "react-native";
import {
  initialize,
  getSdkStatus,
  SdkAvailabilityStatus,
  requestPermission,
  getGrantedPermissions,
  revokeAllPermissions,
  openHealthConnectSettings as _openHCSettings,
  type Permission
} from "react-native-health-connect";
import { READ_PERMISSIONS, WRITE_PERMISSIONS, type RecordType, type PermissionState } from "./types";

const HC_PLAY_STORE_PACKAGE = "com.google.android.apps.healthdata";
const HC_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${HC_PLAY_STORE_PACKAGE}`;
const HC_MARKET_URL = `market://details?id=${HC_PLAY_STORE_PACKAGE}`;

/** Timeout para requestPermission: si HC no responde en 30s, rechazamos el Promise. */
const PERMISSION_TIMEOUT_MS = 30_000;

let _initialized = false;
let _availabilityCache: { value: "installed" | "not_installed"; ts: number } | null = null;
const AVAILABILITY_CACHE_MS = 5_000;

/**
 * Devuelve si el módulo nativo de react-native-health-connect está cargado.
 * Útil para diagnosticar cuando falta el .kt o no se aplicó el config plugin.
 */
export function isNativeModuleLoaded(): boolean {
  try {
    return typeof getSdkStatus === "function";
  } catch {
    return false;
  }
}

/**
 * Verifica si Health Connect está disponible en el dispositivo.
 *
 * Estrategia robusta (resuelve "No detectado" en Android 13 con HC instalado):
 *   - getSdkStatus() usa el HealthConnectClient.getSdkStatus nativo de Android,
 *     que devuelve SDK_AVAILABLE (3) sin necesidad de <queries>. Esta es la fuente
 *     oficial en Android 14+. En Android 13 devuelve SDK_UNAVAILABLE si no hay
 *     APK instalada.
 *
 * Cachea el resultado 5 segundos para no saturar el bridge en cada render.
 */
export async function checkAvailability(): Promise<"installed" | "not_installed"> {
  const now = Date.now();
  if (_availabilityCache && now - _availabilityCache.ts < AVAILABILITY_CACHE_MS) {
    return _availabilityCache.value;
  }
  try {
    if (!_initialized) {
      try { await initialize(); } catch { /* idempotente */ }
      _initialized = true;
    }

    let available = false;
    if (typeof getSdkStatus === "function") {
      try {
        const status = await getSdkStatus();
        available = status === SdkAvailabilityStatus.SDK_AVAILABLE;
      } catch (err) {
        console.warn("[healthConnect] getSdkStatus failed:", err);
        available = false;
      }
    }

    const result: "installed" | "not_installed" = available ? "installed" : "not_installed";
    _availabilityCache = { value: result, ts: now };
    return result;
  } catch (err) {
    console.warn("[healthConnect] availability check failed:", err);
    return "not_installed";
  }
}

/** Invalida la caché de availability. Útil tras instalar HC desde Play Store. */
export function invalidateAvailabilityCache(): void {
  _availabilityCache = null;
}

/**
 * Abre la ficha de Health Connect en Play Store para instalarlo.
 * Preferimos el intent market:// (más directo) y caemos al https://.
 */
export async function openHealthConnectInPlayStore(): Promise<boolean> {
  try {
    const canOpenMarket = await Linking.canOpenURL(HC_MARKET_URL);
    if (canOpenMarket) {
      await Linking.openURL(HC_MARKET_URL);
      return true;
    }
    await Linking.openURL(HC_PLAY_STORE_URL);
    return true;
  } catch (err) {
    console.error("[healthConnect] no se pudo abrir Play Store:", err);
    return false;
  }
}

/**
 * Abre la pantalla principal de Health Connect (no la de nuestra app).
 * Útil cuando el usuario tiene que activar manualmente permisos que revocó.
 */
export async function openHealthConnectApp(): Promise<void> {
  try {
    await _openHCSettings();
  } catch {
    Linking.openSettings();
  }
}

/**
 * Construye el array de Permission objects que la API v3.2 espera.
 * Combina READ_PERMISSIONS + WRITE_PERMISSIONS en una sola lista.
 */
function buildPermissionsList(): Permission[] {
  const readPerms: Permission[] = READ_PERMISSIONS.map((rt) => ({
    accessType: "read" as const,
    recordType: rt
  }));
  const writePerms: Permission[] = WRITE_PERMISSIONS.map((rt) => ({
    accessType: "write" as const,
    recordType: rt
  }));
  return [...readPerms, ...writePerms];
}

/**
 * Comprueba si un Permission está concedido en la lista granted.
 */
function isPermGranted(perm: Permission, granted: Permission[]): boolean {
  return granted.some(
    (g) => g.accessType === perm.accessType && g.recordType === perm.recordType
  );
}

/**
 * Pide TODOS los permisos necesarios: lectura de steps/HR/kcal/sleep/body comp
 * y escritura de ExerciseSession.
 * Devuelve "granted" / "partial" / "denied".
 *
 * ESTRATEGIA v0.3.5 (sin crash):
 *   Antes llamábamos requestPermission() del SDK nativo, pero esto crashea
 *   la app con ActivityNotFoundException / ClassNotFoundException en algunos
 *   setups (RN 0.74 New Arch + react-native-health-connect 3.2 sin
 *   HealthConnectPermissionDelegate registrado en MainActivity).
 *
 *   Ahora usamos un enfoque más robusto:
 *     1) Llamamos requestPermission() en un try/catch.
 *     2) Si falla (cualquier error), NO crasheamos: abrimos directamente la
 *        pantalla de gestión de permisos de Health Connect con
 *        openHealthConnectApp() (que usa el intent oficial de Android).
 *     3) El usuario concede manualmente ahí, vuelve a la app, y al refrescar
 *        getCurrentPermissionState() detecta los permisos concedidos.
 *
 *   Esto evita el crash nativo y da al usuario una vía para conceder permisos.
 */
export async function requestAllPermissions(): Promise<PermissionState> {
  if (!isNativeModuleLoaded()) {
    console.error("[healthConnect] módulo nativo NO cargado.");
    return "not_requested";
  }

  // Intento 1: requestPermission nativo (puede funcionar en Android 14+)
  try {
    if (!_initialized) {
      try { await initialize(); } catch { /* idempotente */ }
      _initialized = true;
    }

    const wantedPerms = buildPermissionsList();

    const granted = await Promise.race([
      requestPermission(wantedPerms),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PERMISSION_TIMEOUT")), PERMISSION_TIMEOUT_MS)
      )
    ]) as Permission[];

    if (Array.isArray(granted) && granted.length > 0) {
      const wantedRead = wantedPerms.filter((p) => p.accessType === "read");
      const wantedWrite = wantedPerms.filter((p) => p.accessType === "write");
      const allReadGranted = wantedRead.every((p) => isPermGranted(p, granted));
      const allWriteGranted = wantedWrite.every((p) => isPermGranted(p, granted));

      if (allReadGranted && allWriteGranted) return "granted";
      if (allReadGranted || allWriteGranted) return "partial";
    }
    // Si llegó aquí, el diálogo nativo no funcionó bien → fallback a ajustes
  } catch (err: any) {
    console.warn(
      "[healthConnect] requestPermission falló (probable crash nativo). " +
      "Abriendo ajustes de Health Connect como fallback. Error:",
      err?.message ?? err
    );
  }

  // Intento 2 (fallback seguro, sin crash): abrir ajustes de Health Connect.
  // El usuario concede manualmente y vuelve a la app.
  try {
    await openHealthConnectApp();
    return "not_requested"; // No sabemos aún el estado, el usuario debe refrescar
  } catch (err) {
    console.error("[healthConnect] también falló openHealthConnectApp:", err);
    return "not_requested";
  }
}

/**
 * Revisa qué permisos están concedidos actualmente sin pedirlos.
 * Lo usa la UI para mostrar el estado real.
 *
 * Hardening: si getGrantedPermissions crashea (módulo mal inicializado),
 * devolvemos "not_requested" en lugar de propagar el error.
 */
export async function getCurrentPermissionState(): Promise<PermissionState> {
  if (!isNativeModuleLoaded()) return "not_requested";
  try {
    if (!_initialized) {
      try { await initialize(); } catch { /* idempotente */ }
      _initialized = true;
    }
    const granted = (await getGrantedPermissions()) as Permission[];
    if (!granted || granted.length === 0) return "not_requested";

    const wantedPerms = buildPermissionsList();
    const wantedRead = wantedPerms.filter((p) => p.accessType === "read");
    const wantedWrite = wantedPerms.filter((p) => p.accessType === "write");
    const allReadGranted = wantedRead.every((p) => isPermGranted(p, granted));
    const allWriteGranted = wantedWrite.every((p) => isPermGranted(p, granted));

    if (allReadGranted && allWriteGranted) return "granted";
    if (allReadGranted || allWriteGranted) return "partial";
    return "denied";
  } catch (err) {
    console.warn("[healthConnect] getCurrentPermissionState failed:", err);
    return "not_requested";
  }
}

/**
 * Revoca todos los permisos que la app tiene en HC (lo usa "Reset").
 */
export async function revokePermissions(): Promise<void> {
  try {
    await revokeAllPermissions();
  } catch (err) {
    console.warn("[healthConnect] revokeAllPermissions failed:", err);
  }
}

/**
 * Helper para invocar un reader genérico con paginación por time window.
 * Lo usan todos los readers especializados.
 */
export async function readHcRecords(
  recordType: RecordType,
  startTimeEpochMs: number,
  endTimeEpochMs: number,
  extraOps?: Record<string, any>
): Promise<any[]> {
  const { readRecords } = require("react-native-health-connect");
  const result = await readRecords(recordType, {
    timeRangeFilter: {
      operator: "between",
      startTime: startTimeEpochMs,
      endTime: endTimeEpochMs
    },
    ...(extraOps ?? {})
  });
  return Array.isArray(result) ? result : (result?.records ?? []);
}

/** Es true solo si el APK está corriendo en Android. */
export const isAndroid = Platform.OS === "android";
