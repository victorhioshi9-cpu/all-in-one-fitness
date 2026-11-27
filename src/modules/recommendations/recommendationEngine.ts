/**
 * recommendationEngine.ts
 * ----------------------------------------------------------------------------
 * Motor de Recomendaciones Inteligentes.
 * Cruza:
 *   - Readiness Score de hoy
 *   - Calendario planificado de hoy
 *   - Mapa de calor muscular (fatiga por grupo en últimos 7 días)
 *   - Calorías ingeridas vs objetivo (Energy Balance)
 *   - Pasos / gasto del reloj
 *   - Hidratación diaria
 *   - Historial de cámara (VBT loss, asimetría, fallos recurrentes, molestias marcadas)
 *
 * Genera recomendaciones accionables, NO médicas.
 * Cada recomendación tiene: severity (info/suggest/strong), title, body, action (deep link).
 */
import { computeReadiness } from "@/modules/intelligence/readiness";
import { computeDayEnergyBalance, computeWeeklyEnergyBalance } from "@/modules/intelligence/energyBalance";
import { getDailyWater } from "@/modules/nutrition/foodRepo";
import { readStepsForDay } from "@/modules/health/readers/stepsReader";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { todayISO, daysAgoISO } from "@/modules/intelligence/dateUtils";
import { toLocalISO } from "@/modules/intelligence/dateUtils";

export type RecommendationSeverity = "info" | "suggest" | "strong";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  category: "training" | "nutrition" | "hydration" | "recovery" | "technique";
  title: string;
  body: string;
  action?: { label: string; deepLink: string };
}

export async function generateRecommendations(): Promise<Recommendation[]> {
  const today = todayISO();
  const recs: Recommendation[] = [];

  // 1) Readiness + planificación del día
  const [ready, dayBal, water, steps, planned] = await Promise.all([
    computeReadiness().catch(() => null),
    computeDayEnergyBalance(today).catch(() => null),
    getDailyWater(today).catch(() => 0),
    readStepsForDay(today).catch(() => null),
    getPlannedSessions(today)
  ]);

  // 2) Mapa de calor muscular: ¿qué grupos están fatigados?
  const fatiguedMuscles = await getFatiguedMuscles(7);
  // 3) Historial de cámara: fallos recurrentes, asimetría, VBT loss
  const cameraHistory = await getCameraHistoryInsights(7);

  // --- Readiness-based ---
  if (ready) {
    if (ready.totalScore < 50 && planned.length > 0) {
      recs.push({
        id: "low_readiness_rest",
        severity: "strong",
        category: "recovery",
        title: "Readiness bajo (" + ready.totalScore + "/100)",
        body: "Tu sueño, FC reposo y fatiga muscular indican que necesitas recuperación. Considera cambiar la sesión planificada por cardio ligero o descanso activo.",
        action: { label: "Ver planificación", deepLink: "aiofitness://calendar" }
      });
    } else if (ready.totalScore >= 85 && planned.length > 0) {
      recs.push({
        id: "peak_readiness_pr",
        severity: "info",
        category: "training",
        title: "Readiness óptimo (" + ready.totalScore + "/100)",
        body: "Estás en condiciones ideales para intentar un PR o aumentar intensidad en " + planned[0]?.routineName + ".",
        action: { label: "Abrir Coach", deepLink: "aiofitness://coach" }
      });
    }
  }

  // --- Muscular fatigue-based ---
  if (fatiguedMuscles.length > 0 && planned.length > 0) {
    const plannedMuscles = await getMusclesForPlanned(planned);
    const overlap = fatiguedMuscles.filter(m => plannedMuscles.includes(m.muscle));
    if (overlap.length > 0) {
      recs.push({
        id: "muscle_fatigue_overlap",
        severity: "suggest",
        category: "training",
        title: "Fatiga muscular detectada",
        body: "Los siguientes músculos planeados para hoy están fatigados: " + overlap.map(m => m.muscle).join(", ") + ". Considera cambiar a un grupo no fatigado o reducir volumen 20%.",
        action: { label: "Ver heatmap", deepLink: "aiofitness://workouts" }
      });
    }
  }

  // --- Energy balance-based ---
  if (dayBal) {
    const deficit = dayBal.kcalOutTotal - dayBal.kcalIn;
    if (deficit > 800 && steps && steps.value > 8000) {
      recs.push({
        id: "high_deficit_warning",
        severity: "strong",
        category: "nutrition",
        title: "Déficit calórico elevado (" + Math.round(deficit) + " kcal)",
        body: "Llevas un déficit superior a 800 kcal hoy con alta actividad. Comer algo ahora evitará pérdida de masa magra y bajones de energía.",
        action: { label: "Añadir comida", deepLink: "aiofitness://nutrition" }
      });
    } else if (dayBal.kcalIn > dayBal.kcalOutTotal + 300 && dayBal.kcalOutTotal > 0) {
      recs.push({
        id: "surplus_info",
        severity: "info",
        category: "nutrition",
        title: "Superávit calórico (" + Math.round(dayBal.kcalIn - dayBal.kcalOutTotal) + " kcal)",
        body: "Estás por encima de tu gasto. Si estás en volumen, perfecto. Si no, considera caminar 20 min más.",
        action: { label: "Ver nutrición", deepLink: "aiofitness://nutrition" }
      });
    }
  }

  // --- Hydration ---
  if (water < 1500) {
    recs.push({
      id: "low_hydration",
      severity: "suggest",
      category: "hydration",
      title: "Hidratación baja (" + water + " ml)",
      body: "Llevas menos de 1.5L hoy. Bebe 500 ml ahora para mejorar rendimiento y recuperación.",
      action: { label: "+500ml", deepLink: "aiofitness://addwater/500" }
    });
  }

  // --- Steps ---
  if (steps && steps.value < 4000) {
    recs.push({
      id: "low_steps",
      severity: "info",
      category: "recovery",
      title: "Pocos pasos hoy (" + steps.value + ")",
      body: "Estás por debajo de 4000 pasos. Una caminata de 15 min subiría tu NEAT y mejoraría tu recuperación activa."
    });
  }

  // --- Camera history-based ---
  if (cameraHistory.recurrentFaults.length > 0) {
    recs.push({
      id: "technique_focus",
      severity: "suggest",
      category: "technique",
      title: "Fallo técnico recurrente",
      body: "Última semana: " + cameraHistory.recurrentFaults.join(", ") + ". Enfócate hoy en corregir " + cameraHistory.recurrentFaults[0] + " antes de cargar más peso.",
      action: { label: "Calibrar técnica", deepLink: "aiofitness://coach" }
    });
  }
  if (cameraHistory.avgVbtLoss > 25) {
    recs.push({
      id: "vbt_fatigue",
      severity: "suggest",
      category: "training",
      title: "Fatiga por VBT (" + cameraHistory.avgVbtLoss.toFixed(0) + "% pérdida)",
      body: "Tu velocidad concéntrica baja consistentemente en series finales. Aumenta 30s de descanso entre series pesadas."
    });
  }
  if (cameraHistory.sorenessTags > 0) {
    recs.push({
      id: "soreness_reported",
      severity: "suggest",
      category: "recovery",
      title: "Molestias marcadas (" + cameraHistory.sorenessTags + " veces)",
      body: "Has marcado molestia en " + cameraHistory.sorenessTags + " series esta semana. Haz movilidad 10 min antes de entrenar ese grupo."
    });
  }

  // Sort by severity (strong > suggest > info)
  const sevOrder: Record<RecommendationSeverity, number> = { strong: 0, suggest: 1, info: 2 };
  recs.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return recs;
}

// --- Helpers ---------------------------------------------------------------
async function getPlannedSessions(dayIso: string) {
  const db = await openDatabase();
  const rows = await queryAsync<any>(db, "SELECT * FROM planned_sessions WHERE day = ? AND status = 'planned'", [dayIso]);
  return rows.map(r => ({ id: r.id, routineName: r.planned_exercises ?? "Entreno", routineId: r.routine_id }));
}

async function getFatiguedMuscles(daysBack: number): Promise<{ muscle: string; volumeKg: number; fatigueScore: number }[]> {
  const db = await openDatabase();
  const today = new Date();
  const out: { muscle: string; volumeKg: number; fatigueScore: number }[] = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const iso = toLocalISO(d);
    const rows = await queryAsync<{ muscle: string; vol: number }>(
      db,
      `SELECT e.primary_muscle as muscle, SUM(s.volume_kg) as vol
       FROM sets s JOIN exercises e ON e.id = s.exercise_id
       WHERE date(s.created_at/1000, 'unixepoch') = ? AND e.primary_muscle IS NOT NULL
       GROUP BY e.primary_muscle`,
      [iso]
    );
    for (const r of rows) {
      const existing = out.find(o => o.muscle === r.muscle);
      if (existing) {
        existing.volumeKg += r.vol;
        existing.fatigueScore = Math.min(1, existing.volumeKg / 5000);  // 5000kg = fatiga alta
      } else {
        out.push({ muscle: r.muscle, volumeKg: r.vol, fatigueScore: Math.min(1, r.vol / 5000) });
      }
    }
  }
  return out.filter(o => o.fatigueScore > 0.4);
}

async function getMusclesForPlanned(planned: any[]): Promise<string[]> {
  // En Fase 3 simplificado: devolvemos todos los músculos posibles
  return ["quadriceps", "hamstrings", "chest", "back", "delts", "biceps", "triceps", "core"];
}

async function getCameraHistoryInsights(daysBack: number): Promise<{
  recurrentFaults: string[];
  avgVbtLoss: number;
  sorenessTags: number;
  asymmetryAvg: number;
}> {
  const db = await openDatabase();
  const since = Date.now() - daysBack * 86400_000;
  const sets = await queryAsync<any>(
    db,
    `SELECT s.pose_summary FROM sets s WHERE s.created_at >= ? AND s.pose_summary IS NOT NULL`,
    [since]
  );

  const faultCounts = new Map<string, number>();
  let vbtLossSum = 0;
  let vbtLossCount = 0;
  let asymmetrySum = 0;
  let asymmetryCount = 0;

  for (const s of sets) {
    try {
      const ps = JSON.parse(s.pose_summary);
      if (ps.faultsDetected) {
        for (const f of ps.faultsDetected) {
          faultCounts.set(f, (faultCounts.get(f) ?? 0) + 1);
        }
      }
      if (ps.vbt?.lossPct !== undefined) {
        vbtLossSum += ps.vbt.lossPct;
        vbtLossCount++;
      }
      if (ps.asymmetry?.setScore !== undefined) {
        asymmetrySum += ps.asymmetry.setScore;
        asymmetryCount++;
      }
    } catch {}
  }

  const recurrentFaults = Array.from(faultCounts.entries())
    .filter(([_, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([f]) => f);

  // Soreness tags
  const sorenessCount = await queryAsync<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM set_state_tags
     WHERE tag = 'soreness' AND created_at >= ?`,
    [since]
  );

  return {
    recurrentFaults,
    avgVbtLoss: vbtLossCount > 0 ? vbtLossSum / vbtLossCount : 0,
    sorenessTags: sorenessCount[0]?.cnt ?? 0,
    asymmetryAvg: asymmetryCount > 0 ? asymmetrySum / asymmetryCount : 0
  };
}
