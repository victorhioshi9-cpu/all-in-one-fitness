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
import { READ_PERMISSIONS, WRITE_PERMISSIONS, RECORD_LABEL, type RecordType, type PermissionState } from "./types";

const HC_PLAY_STORE_PACKAGE = "com.google.android.apps.healthdata";
const HC_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${HC_PLAY_STORE_PACKAGE}`;
const HC_MARKET_URL = `market://details?id=${HC_PLAY_STORE_PACKAGE}`;

/** Convierte strings ISO (lo que devuelve HC v3.2) a ms epoch; deja pasar números. */
function toMs(v: any): any {
  if (typeof v !== "string") return v;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? v : t;
}

/**
 * Normaliza un record crudo de HC: startTime/endTime/time, samples[].time y
 * stages[].startTime/endTime pasan a ms epoch (number). Así todos los readers
 * y dedupeBySource trabajan con números (antes daba NaN y se perdían records).
 */
function normalizeRecord(r: any): any {
  if (!r || typeof r !== "object") return r;
  const out: any = { ...r };
  for (const k of ["startTime", "endTime", "time"]) {
    if (k in out) out[k] = toMs(out[k]);
  }
  if (Array.isArray(out.samples)) {
    out.samples = out.samples.map((x: any) => ({ ...x, time: toMs(x?.time) }));
  }
  if (Array.isArray(out.stages)) {
    out.stages = out.stages.map((x: any) => ({
      ...x, startTime: toMs(x?.startTime), endTime: toMs(x?.endTime)
    }));
  }
  return out;
}

/** Timeout para requestPermission: si HC no responde en 30s, rechazamos el Promise. */
const PERMISSION_TIMEOUT_MS = 30_000;

let _initialized = false;
let _initPromise: Promise<boolean> | null = null;

/** Últimos errores de lectura por tipo (para mostrar en la UI qué falló). */
const _lastReadErrors: Record<string, string> = {};
export function getLastReadErrors(): Record<string, string> { return { ..._lastReadErrors }; }

/**
 * Inicializa el SDK UNA sola vez y de forma segura frente a llamadas paralelas.
 *
 * BUG CORREGIDO ("Health Connect client is not initialized"): antes se ponía
 * `_initialized = true` aunque initialize() hubiese fallado o aún no hubiese
 * terminado (las lecturas se lanzaban en paralelo con Promise.all). Ahora todas
 * las llamadas esperan la MISMA promesa y solo se marca como listo si
 * initialize() devolvió true. `force` descarta el estado y reinicializa.
 */
export async function ensureInitialized(force = false): Promise<boolean> {
  if (force) { _initialized = false; _initPromise = null; }
  if (_initialized) return true;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const ok = await initialize();
      _initialized = ok !== false;
      if (!_initialized) console.warn("[healthConnect] initialize() devolvió false");
      return _initialized;
    } catch (err) {
      console.warn("[healthConnect] initialize falló:", err);
      _initialized = false;
      return false;
    } finally {
      _initPromise = null;
    }
  })();
  return _initPromise;
}

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
    await ensureInitialized();

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
 * Abre la pantalla de gestión de permisos de Health Connect para NUESTRA app.
 *
 * Intenta múltiples vías en orden:
 *   1) Intent explícito ACTION_MANAGE_HEALTH_PERMISSIONS con package de nuestra app
 *      → abre directamente la pantalla "Permisos de All-in-One Fitness" dentro
 *      de Health Connect (Android 14+).
 *   2) openHealthConnectSettings() del SDK (que a veces abre la pantalla general
 *      de HC donde hay que buscar la app manualmente).
 *   3) Linking.openSettings() como último recurso (ajustes de la app Android).
 *
 * Esto resuelve 'no aparece mi app para darle permisos' porque el intent #1
 * abre DIRECTAMENTE la pantalla de permisos de nuestra app, sin que el usuario
 * tenga que buscarla en una lista.
 */
export async function openHealthConnectApp(): Promise<void> {
  // Opción 1: intent directo ACTION_MANAGE_HEALTH_PERMISSIONS (Android 14+).
  // URI format: package:com.aiofitness.coach
  const ourPackage = "com.aiofitness.coach";
  const managePermsUrl = `android.settings.health.MANAGE_HEALTH_PERMISSIONS`;
  const managePermsWithPkg = `${managePermsUrl}?package=${ourPackage}`;

  try {
    // Probamos primero con el scheme package: (algunas ROMs lo soportan).
    const intentUrl = `intent://#Intent;action=android.settings.health.MANAGE_HEALTH_PERMISSIONS;package=${ourPackage};end`;
    const canOpenIntent = await Linking.canOpenURL(intentUrl).catch(() => false);
    if (canOpenIntent) {
      await Linking.openURL(intentUrl);
      console.log("[healthConnect] abierto ACTION_MANAGE_HEALTH_PERMISSIONS (intent)");
      return;
    }
  } catch (err) {
    console.warn("[healthConnect] intent ACTION_MANAGE_HEALTH_PERMISSIONS falló:", err);
  }

  // Opción 2: scheme del SDK.
  try {
    const canOpenManage = await Linking.canOpenURL(managePermsWithPkg).catch(() => false);
    if (canOpenManage) {
      await Linking.openURL(managePermsWithPkg);
      console.log("[healthConnect] abierto MANAGE_HEALTH_PERMISSIONS (scheme)");
      return;
    }
  } catch (err) {
    console.warn("[healthConnect] scheme MANAGE_HEALTH_PERMISSIONS falló:", err);
  }

  // Opción 3: openHealthConnectSettings() del SDK nativo.
  try {
    await _openHCSettings();
    console.log("[healthConnect] abierto _openHCSettings() del SDK");
    return;
  } catch (err) {
    console.warn("[healthConnect] _openHCSettings() falló:", err);
  }

  // Opción 4: ajustes generales de la app Android (último recurso).
  try {
    await Linking.openSettings();
    console.log("[healthConnect] abierto Linking.openSettings() (último recurso)");
  } catch (err) {
    console.error("[healthConnect] TODAS las opciones de apertura fallaron:", err);
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
 * Abre la pantalla de gestión de permisos de Health Connect.
 *
 * ESTRATEGIA v0.3.6 (sin crash, sin requestPermission):
 *   NO llamamos a requestPermission() del SDK nativo. Aunque tengamos
 *   activity-alias configurado, en algunos setups RN 0.74 New Arch
 *   + react-native-health-connect 3.2 el bridge nativo lanza una excepción
 *   que MATA EL PROCESO antes de que el try/catch JS lo pueda atrapar
 *   (es un crash a nivel JNI, no un throw JS).
 *
 *   En su lugar, abrimos DIRECTAMENTE los ajustes de Health Connect con
 *   openHealthConnectApp() (que usa un intent ACTION_HEALTH_PERMISSION_SETTINGS
 *   oficial de Android). El usuario concede manualmente ahí, vuelve a la app,
 *   y al refrescar getCurrentPermissionState() detecta los permisos concedidos.
 *
 *   Esto es 100% libre de crashes nativos.
 */
export async function requestAllPermissions(): Promise<PermissionState> {
  if (!isNativeModuleLoaded()) {
    console.error("[healthConnect] módulo nativo NO cargado.");
    return "not_requested";
  }

  // Inicializamos el SDK para que getSdkStatus/getGrantedPermissions funcionen
  await ensureInitialized();

  // Abrimos directamente los ajustes de Health Connect.
  // El usuario concede manualmente y vuelve a la app.
  try {
    await openHealthConnectApp();
    return "not_requested";
  } catch (err) {
    console.error("[healthConnect] openHealthConnectApp falló:", err);
    return "not_requested";
  }
}

/**
 * Revisa qué permisos están concedidos actualmente sin pedirlos.
 * Lo usa la UI para mostrar el estado real.
 *
 * "granted"  = todos los permisos de LECTURA concedidos (los de escritura son
 *              opcionales: solo sirven para publicar entrenos en HC).
 * "partial"  = al menos uno de lectura concedido pero faltan otros.
 * "denied"   = hay permisos concedidos a la app pero ninguno de lectura.
 */
export async function getCurrentPermissionState(): Promise<PermissionState> {
  if (!isNativeModuleLoaded()) return "not_requested";
  try {
    await ensureInitialized();
    const granted = (await getGrantedPermissions()) as Permission[];
    if (!granted || granted.length === 0) return "not_requested";

    const wantedRead = buildPermissionsList().filter((p) => p.accessType === "read");
    const nGranted = wantedRead.filter((p) => isPermGranted(p, granted)).length;
    if (nGranted === wantedRead.length) return "granted";
    if (nGranted > 0) return "partial";
    return "denied";
  } catch (err) {
    console.warn("[healthConnect] getCurrentPermissionState failed:", err);
    return "not_requested";
  }
}

/**
 * Lista los tipos de LECTURA que todavía no tienen permiso (p. ej. Peso, % Grasa,
 * Estatura: justo los que fallaban con "lacks the following permissions").
 */
export async function getMissingReadPermissions(): Promise<{ type: RecordType; label: string }[]> {
  if (!isNativeModuleLoaded()) return READ_PERMISSIONS.map((t) => ({ type: t, label: RECORD_LABEL[t] ?? t }));
  try {
    await ensureInitialized();
    const granted = (await getGrantedPermissions()) as Permission[];
    return READ_PERMISSIONS
      .filter((rt) => !(granted ?? []).some((g) => g.accessType === "read" && g.recordType === rt))
      .map((t) => ({ type: t, label: RECORD_LABEL[t] ?? t }));
  } catch {
    return [];
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
 *
 *  - Espera a que el SDK esté inicializado (promesa compartida).
 *  - Si falla con "not initialized", reinicializa y reintenta UNA vez.
 *  - Sigue `pageToken` para no truncar días con muchos records (HC devuelve
 *    como máximo `pageSize` por página).
 */
export async function readHcRecords(
  recordType: RecordType,
  startTimeEpochMs: number,
  endTimeEpochMs: number,
  extraOps?: Record<string, any>
): Promise<any[]> {
  const MAX_PAGES = 20;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ready = await ensureInitialized(attempt > 0);
      if (!ready) throw new Error("Health Connect client is not initialized");
      const hc = require("react-native-health-connect");

      // SDK v3.2 espera startTime/endTime como String ISO 8601.
      const timeRangeFilter = {
        operator: "between",
        startTime: new Date(startTimeEpochMs).toISOString(),
        endTime: new Date(endTimeEpochMs).toISOString()
      };

      const all: any[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await hc.readRecords(recordType, {
          timeRangeFilter,
          ...(extraOps ?? {}),
          ...(pageToken ? { pageToken } : {})
        });
        const recs: any[] = Array.isArray(result) ? result : (result?.records ?? []);
        all.push(...recs);
        pageToken = Array.isArray(result) ? undefined : result?.pageToken;
        if (!pageToken || recs.length === 0) break;
      }

      delete _lastReadErrors[recordType];
      console.log(`[healthConnect] readHcRecords(${recordType}) → ${all.length} registros`);
      return all.map(normalizeRecord);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (attempt === 0 && /not initialized/i.test(msg)) {
        console.warn(`[healthConnect] ${recordType}: cliente no inicializado, reintentando…`);
        continue;
      }
      _lastReadErrors[recordType] = msg;
      console.error(`[healthConnect] readHcRecords(${recordType}) ERROR:`, err);
      return [];
    }
  }
  return [];
}

/** Es true solo si el APK está corriendo en Android. */
export const isAndroid = Platform.OS === "android";
