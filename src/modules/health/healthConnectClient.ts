/**
 * healthConnectClient.ts
 * ----------------------------------------------------------------------------
 * Wrapper sobre `react-native-health-connect` (v3+).
 *
 * Responsabilidades:
 *   - Verificar si Health Connect está instalado en el dispositivo.
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
 */
import { Linking, Platform } from "react-native";
import {
  initialize,
  isHealthConnectAvailable,
  requestPermission,
  getGrantedPermissions,
  revokeAllPermissions,
  openHealthConnectSettings as _openHCSettings,
  type PermissionResult
} from "react-native-health-connect";
import { READ_PERMISSIONS, WRITE_PERMISSIONS, type RecordType, type PermissionState } from "./types";

const HC_PLAY_STORE_PACKAGE = "com.google.android.apps.healthdata";
const HC_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${HC_PLAY_STORE_PACKAGE}`;
const HC_MARKET_URL = `market://details?id=${HC_PLAY_STORE_PACKAGE}`;

let _initialized = false;

/**
 * Verifica si Health Connect está disponible en el dispositivo.
 * En Android 14+ viene preinstalado; en Android 13- hay que descargarlo.
 */
export async function checkAvailability(): Promise<"installed" | "not_installed"> {
  try {
    if (!_initialized) {
      await initialize().catch(() => { /* idempotente */ });
      _initialized = true;
    }
    const installed = await isHealthConnectAvailable();
    return installed ? "installed" : "not_installed";
  } catch (err) {
    console.warn("[healthConnect] availability check failed:", err);
    return "not_installed";
  }
}

/**
 * Abre la ficha de Health Connect en Play Store para instalarlo.
 * Preferimos el intent market:// (más directo) y caemos al https://.
 */
export async function openHealthConnectInPlayStore(): Promise<boolean> {
  try {
    // Primero intenta el scheme market://
    const canOpenMarket = await Linking.canOpenURL(HC_MARKET_URL);
    if (canOpenMarket) {
      await Linking.openURL(HC_MARKET_URL);
      return true;
    }
    // Fallback https
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
    // Fallback: abrir los ajustes generales de la app
    Linking.openSettings();
  }
}

/**
 * Pide TODOS los permisos necesarios: lectura de steps/HR/kcal/sleep/body comp
 * y escritura de ExerciseSession.
 * Devuelve "granted" / "partial" / "denied".
 */
export async function requestAllPermissions(): Promise<PermissionState> {
  try {
    const result: PermissionResult = await requestPermission(
      [...READ_PERMISSIONS] as string[],
      [...WRITE_PERMISSIONS] as string[]
    );
    if (result.everyGranted) return "granted";
    if (result.someGranted) return "partial";
    return "denied";
  } catch (err) {
    console.error("[healthConnect] requestPermission error:", err);
    return "denied";
  }
}

/**
 * Revisa qué permisos están concedidos actualmente sin pedirlos.
 * Lo usa la UI para mostrar el estado real.
 */
export async function getCurrentPermissionState(): Promise<PermissionState> {
  try {
    const granted = await getGrantedPermissions();
    if (!granted || granted.length === 0) return "not_requested";

    const wantedRead = READ_PERMISSIONS.every((rt) => granted.includes(rt as any));
    const wantedWrite = WRITE_PERMISSIONS.every((rt) => granted.includes(rt as any));

    if (wantedRead && wantedWrite) return "granted";
    if (wantedRead || wantedWrite) return "partial";
    return "denied";
  } catch {
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
