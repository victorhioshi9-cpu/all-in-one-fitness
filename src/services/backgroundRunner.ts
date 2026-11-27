import { AppState, AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

type TaskCallback = (elapsedSeconds: number) => void | Promise<void>;

class FitnessSessionRunner {
  private isRunning = false;
  private startTimestamp: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private onTick: TaskCallback | null = null;

  async start(onTick?: TaskCallback, keepScreenOn = true): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTimestamp = Date.now();
    this.onTick = onTick ?? null;

    if (keepScreenOn) {
      try {
        await activateKeepAwakeAsync('fitness-session');
      } catch {
        // Ignorar si no se puede mantener la pantalla activa
      }
    }

    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);

    this.intervalId = setInterval(() => {
      if (!this.isRunning || this.startTimestamp === null) return;
      const elapsedSeconds = Math.floor((Date.now() - this.startTimestamp) / 1000);
      this.onTick?.(elapsedSeconds);
    }, 1000);
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active' && this.isRunning && this.startTimestamp !== null) {
      const elapsedSeconds = Math.floor((Date.now() - this.startTimestamp) / 1000);
      this.onTick?.(elapsedSeconds);
    }
  };

  getElapsedSeconds(): number {
    if (!this.isRunning || this.startTimestamp === null) return 0;
    return Math.floor((Date.now() - this.startTimestamp) / 1000);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.startTimestamp = null;
    this.onTick = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.appStateSub?.remove();
    this.appStateSub = null;

    try {
      deactivateKeepAwake('fitness-session');
    } catch {
      // Ignorar si ya estaba inactivo
    }
  }
}

export const backgroundRunner = new FitnessSessionRunner();
