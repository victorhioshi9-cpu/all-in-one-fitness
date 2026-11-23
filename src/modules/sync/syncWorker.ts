/**
 * syncWorker.ts
 * ----------------------------------------------------------------------------
 * Sync worker para drenar sync_queue hacia Supabase sin dependencias
 * nativas de foreground service incompatibles con Android SDK/AndroidX.
 */
import { drainSyncQueue, countPending } from "@/modules/cloud/syncService";
import { pingDevicePresence } from "@/modules/cloud/supabaseClient";
import { isOnline, onConnectivityChange } from "./netInfo";
import { backgroundRunner } from "@/services/backgroundRunner";

const SYNC_INTERVAL_MS = parseInt(
  process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS ?? "300000",
  10
);

let _running = false;
let _stopRequested = false;
let _lastRunResult: { pushed: number; failed: number; ts: number } | null = null;
let _onlineUnsub: (() => void) | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function workerLoop(): Promise<void> {
  if (_running) return;
  _running = true;
  _stopRequested = false;

  await pingDevicePresence().catch(() => {});

  _onlineUnsub = onConnectivityChange(async (online) => {
    if (online && !_stopRequested) {
      const pending = await countPending();
      if (pending > 0) await drainOnce();
    }
  });

  while (!_stopRequested) {
    if (isOnline()) {
      const pending = await countPending();
      if (pending > 0) {
        await drainOnce();
      } else {
        await sleep(SYNC_INTERVAL_MS);
        continue;
      }
    }
    await sleep(isOnline() ? 5000 : 30000);
  }

  _onlineUnsub?.();
  _onlineUnsub = null;
  _running = false;
}

async function drainOnce(): Promise<void> {
  try {
    const result = await drainSyncQueue();
    _lastRunResult = {
      pushed: result.pushed,
      failed: result.failed,
      ts: Date.now(),
    };
    if (result.pushed > 0 && isOnline() && !_stopRequested) {
      const stillPending = await countPending();
      if (stillPending > 0) {
        await sleep(500);
        await drainOnce();
      }
    }
  } catch (err) {
    console.error("[syncWorker] drain failed:", err);
  }
}

export async function startSyncWorker(): Promise<void> {
  if (_running) return;

  try {
    await backgroundRunner.start(undefined, false);
  } catch {
    // Continuar aunque keepAwake no aplique
  }

  void workerLoop();
}

export async function stopSyncWorker(): Promise<void> {
  _stopRequested = true;
  _onlineUnsub?.();
  _onlineUnsub = null;

  try {
    await backgroundRunner.stop();
  } catch {}
}

export function isSyncRunning(): boolean {
  return _running;
}

export function getLastRunResult() {
  return _lastRunResult;
}

export async function forceDrainNow(): Promise<{ pushed: number; failed: number }> {
  if (!isOnline()) {
    return { pushed: 0, failed: 0 };
  }
  const r = await drainSyncQueue();
  return { pushed: r.pushed, failed: r.failed };
}
