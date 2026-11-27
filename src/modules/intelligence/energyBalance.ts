/**
 * energyBalance.ts
 * ----------------------------------------------------------------------------
 * Balance Energético Dinámico:
 *   - kcal_in: suma de nutrition_logs del día (manual + futuras Fase 3)
 *   - kcal_out_total: basal + active + workout (de Health Connect + nuestras)
 *   - balance = kcal_in - kcal_out_total
 *
 * También calcula el déficit/superávit semanal acumulado, que es lo que
 * realmente manda sobre la pérdida de grasa (no el balance de un solo día).
 */
import { readCaloriesForDay, readActiveCaloriesInRange } from "@/modules/health/readers/caloriesReader";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { todayISO, daysAgoISO } from "./dateUtils";

export interface EnergyBalanceDay {
  day: string;
  kcalIn: number;
  kcalOutActive: number;
  kcalOutBasal: number;
  kcalOutWorkout: number;     // estimación nuestra (no del reloj)
  kcalOutTotal: number;
  balance: number;            // negativo = déficit, positivo = superávit
}

export interface EnergyBalanceWeek {
  days: EnergyBalanceDay[];
  totalKcalIn: number;
  totalKcalOut: number;
  totalBalance: number;
  avgDailyBalance: number;
  /** Estimación de cambio de peso en 7 días (1 kg grasa ~ 7700 kcal). */
  projectedFatDeltaKg: number;
}

/**
 * Balance energético de un día concreto.
 */
export async function computeDayEnergyBalance(dayIso: string): Promise<EnergyBalanceDay> {
  // 1) kcal_in desde nutrition_logs (Fase 2: solo manual; Fase 3: + escáner)
  const db = await openDatabase();
  const inRow = await queryAsync<{ kcal_in: number | null }>(
    db,
    "SELECT COALESCE(SUM(kcal), 0) as kcal_in FROM nutrition_logs WHERE day = ?",
    [dayIso]
  );
  const kcalIn = inRow[0]?.kcal_in ?? 0;

  // 2) kcal_out del reloj (Health Connect)
  const cal = await readCaloriesForDay(dayIso);
  const kcalOutActive = cal?.activeKcal ?? 0;
  const kcalOutBasal = cal?.basalKcal ?? 0;

  // 3) kcal_out_workout: sumamos las kcal estimadas de nuestras ExerciseSessions
  //    que no estén ya contadas por el reloj. Para Fase 2 asumimos que el reloj
  //    ya cuenta la sesión (escritas vía workoutWriter.ts), así que no duplicamos.
  const kcalOutWorkout = 0;

  const kcalOutTotal = kcalOutActive + kcalOutBasal + kcalOutWorkout;

  return {
    day: dayIso,
    kcalIn,
    kcalOutActive,
    kcalOutBasal,
    kcalOutWorkout,
    kcalOutTotal,
    balance: kcalIn - kcalOutTotal
  };
}

/**
 * Balance de los últimos 7 días.
 */
export async function computeWeeklyEnergyBalance(): Promise<EnergyBalanceWeek> {
  const days: EnergyBalanceDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const iso = daysAgoISO(i);
    days.push(await computeDayEnergyBalance(iso));
  }

  const totalKcalIn = days.reduce((s, d) => s + d.kcalIn, 0);
  const totalKcalOut = days.reduce((s, d) => s + d.kcalOutTotal, 0);
  const totalBalance = totalKcalIn - totalKcalOut;
  const avgDailyBalance = totalBalance / 7;
  const projectedFatDeltaKg = totalBalance / 7700;

  return {
    days,
    totalKcalIn,
    totalKcalOut,
    totalBalance,
    avgDailyBalance,
    projectedFatDeltaKg
  };
}

/**
 * Calorías activas consumidas durante un entreno concreto (por rango de tiempo).
 * Lo usa el post-entreno summary.
 */
export async function getWorkoutCalories(startMs: number, endMs: number): Promise<number> {
  return await readActiveCaloriesInRange(startMs, endMs);
}
