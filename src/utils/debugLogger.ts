/**
 * debugLogger.ts
 * ----------------------------------------------------------------------------
 * Logger singleton que captura logs y los expone a la UI para diagnóstico.
 *
 * Uso:
 *   import { debugLog, debugWarn, debugError, useDebugLogs } from "@/utils/debugLogger";
 *
 *   debugLog("CameraScreen", "cámara abierta");
 *   debugWarn("PosePlugin", "modelo no encontrado");
 *   debugError("CameraScreen", "excepción: " + err.message);
 *
 *   const logs = useDebugLogs(); // se actualiza automáticamente
 *
 * También intercepta console.log/warn/error globalmente para capturar
 * todo lo que se loguea en la app (útil para ver logs de PoseLandmarkerPlugin,
 * useSimplePose, etc. sin necesidad de adb logcat).
 */

import { useState, useEffect } from "react";

export type LogLevel = "log" | "warn" | "error";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  tag: string;
  message: string;
}

const MAX_LOGS = 200;

let logs: LogEntry[] = [];
let nextId = 1;
const subscribers = new Set<() => void>();

let installed = false;

/** Instala interceptores globales de console.log/warn/error. Idempotente. */
function installConsoleInterceptors() {
  if (installed) return;
  installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: any[]) => {
    origLog(...args);
    addLog("log", "console", args.map(formatArg).join(" "));
  };
  console.warn = (...args: any[]) => {
    origWarn(...args);
    addLog("warn", "console", args.map(formatArg).join(" "));
  };
  console.error = (...args: any[]) => {
    origError(...args);
    addLog("error", "console", args.map(formatArg).join(" "));
  };
}

function formatArg(arg: any): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function addLog(level: LogLevel, tag: string, message: string) {
  const entry: LogEntry = {
    id: nextId++,
    ts: Date.now(),
    level,
    tag,
    message: message.slice(0, 500)
  };
  logs = [...logs, entry];
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
  setTimeout(() => {
    subscribers.forEach((cb) => cb());
  }, 0);
}

/** API pública para loguear con tag explícito. */
export function debugLog(tag: string, message: string) {
  addLog("log", tag, message);
}

export function debugWarn(tag: string, message: string) {
  addLog("warn", tag, message);
}

export function debugError(tag: string, message: string) {
  addLog("error", tag, message);
}

/** Hook de React para suscribirse a los logs. */
export function useDebugLogs(): LogEntry[] {
  const [state, setState] = useState<LogEntry[]>(logs);
  useEffect(() => {
    const cb = () => setState([...logs]);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);
  return state;
}

/** Limpia todos los logs. */
export function clearDebugLogs() {
  logs = [];
  subscribers.forEach((cb) => cb());
}

/** Instala los interceptores automáticamente al importar este módulo. */
installConsoleInterceptors();
