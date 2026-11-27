/**
 * physiqueAnalysis.ts
 * Análisis corporal a partir de la pose (ML Kit) de una foto de frente + datos
 * de perfil/báscula. Mide proporciones y simetría; NO estima % de grasa desde
 * la imagen (eso lo da la báscula o el dato manual). Es orientativo.
 */
import type { Gender, Goal } from "@/store/settingsStore";

export interface PoseMetrics {
  shoulderHipRatio: number;   // ancho hombros / ancho caderas
  shoulderTiltDeg: number;    // inclinación de hombros
  hipTiltDeg: number;         // inclinación de caderas
  torsoToLegRatio: number;    // torso / pierna
  headOffsetPct: number;      // desvío lateral de la cabeza respecto a hombros (% ancho hombros)
}

export interface FocusItem { area: string; priority: "alta" | "media" | "baja"; advice: string }
export interface PhysiqueReport {
  verdict: "perder" | "ganar" | "mejorar";
  headline: string;
  items: FocusItem[];
}

type P = { x: number; y: number } | undefined;
const d = (a: P, b: P) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);
const mid = (a: P, b: P): P => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined);
const tilt = (a: P, b: P) => (a && b ? Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) : 0);

/** Promedia varios frames de pose plana y calcula las métricas. */
export function computeMetrics(poses: Record<string, number>[]): PoseMetrics | null {
  if (poses.length < 5) return null;
  const avg = (key: string) => {
    const v = poses.map((p) => p[key]).filter((n) => typeof n === "number");
    return v.length >= poses.length * 0.6 ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const pt = (n: string): P => {
    const x = avg(n + "_x"), y = avg(n + "_y");
    return x === undefined || y === undefined ? undefined : { x, y };
  };
  const ls = pt("leftShoulderPosition"), rs = pt("rightShoulderPosition");
  const lh = pt("leftHipPosition"), rh = pt("rightHipPosition");
  const la = pt("leftAnklePosition"), ra = pt("rightAnklePosition");
  const nose = pt("nosePosition");
  if (!ls || !rs || !lh || !rh) return null;

  const shoulderW = d(ls, rs), hipW = d(lh, rh);
  if (shoulderW < 1 || hipW < 1) return null;
  const mS = mid(ls, rs), mH = mid(lh, rh), mA = mid(la, ra);
  const torso = d(mS, mH), leg = mA ? d(mH, mA) : 0;
  return {
    shoulderHipRatio: shoulderW / hipW,
    shoulderTiltDeg: Math.min(tilt(ls, rs), 180 - tilt(ls, rs)),
    hipTiltDeg: Math.min(tilt(lh, rh), 180 - tilt(lh, rh)),
    torsoToLegRatio: leg > 0 ? torso / leg : 0,
    headOffsetPct: nose && mS ? (Math.abs(nose.x - mS.x) / shoulderW) * 100 : 0
  };
}

export interface ReportInput {
  metrics: PoseMetrics | null;
  gender: Gender | null;
  goal: Goal | null;
  bmi: number | null;
  bodyFatPct: number | null;
}

export function buildReport(i: ReportInput): PhysiqueReport {
  const male = i.gender !== "female";
  const highFat = male ? 22 : 30, lowFat = male ? 10 : 18;
  const items: FocusItem[] = [];
  let verdict: PhysiqueReport["verdict"] = "mejorar";

  const fatHigh = i.bodyFatPct != null ? i.bodyFatPct >= highFat : (i.bmi ?? 0) >= 27;
  const thin = i.bodyFatPct != null ? i.bodyFatPct <= lowFat && (i.bmi ?? 22) < 22 : (i.bmi ?? 22) < 19.5;

  if (fatHigh) {
    verdict = "perder";
    items.push({ area: "Composición", priority: "alta",
      advice: "Tu prioridad es BAJAR grasa: déficit moderado, proteína alta, pesas 3–4 días y 8–10k pasos. Así conservas músculo." });
  } else if (thin) {
    verdict = "ganar";
    items.push({ area: "Composición", priority: "alta",
      advice: "Tu prioridad es GANAR masa: superávit de 250–500 kcal, proteína 1.8–2.2 g/kg y entrenamiento de fuerza con progresión." });
  } else {
    items.push({ area: "Composición", priority: "media",
      advice: "Composición equilibrada: enfócate en MEJORAR proporciones y fuerza (recomposición o ligero superávit)." });
  }

  const m = i.metrics;
  if (m) {
    const target = male ? 1.35 : 1.15;
    if (m.shoulderHipRatio < target - 0.12) {
      items.push({ area: "Hombros / espalda", priority: "alta",
        advice: "Hombros estrechos respecto a la cadera: más volumen en elevaciones laterales, press militar, dominadas y remos." });
    } else if (m.shoulderHipRatio > target + 0.35 && !male) {
      items.push({ area: "Tren inferior", priority: "media", advice: "Equilibra con más trabajo de glúteo y pierna (hip thrust, sentadilla, zancadas)." });
    }
    if (m.torsoToLegRatio > 0 && m.torsoToLegRatio < 0.62) {
      items.push({ area: "Tronco", priority: "baja", advice: "Piernas largas respecto al tronco: refuerza core y espalda alta para más presencia de torso." });
    }
    if (m.shoulderTiltDeg > 3.5 || m.hipTiltDeg > 3.5) {
      items.push({ area: "Simetría / postura", priority: "media",
        advice: "Se aprecia inclinación de hombros o caderas (puede ser solo la postura al foto): trabaja unilaterales, movilidad y repite la foto bien erguido." });
    }
    if (m.headOffsetPct > 18) {
      items.push({ area: "Postura", priority: "baja", advice: "Cabeza desviada respecto a los hombros: cuida la alineación de cuello y trabaja cuello/trapecio." });
    }
  } else {
    items.push({ area: "Foto", priority: "media", advice: "No se detectó el cuerpo completo: repite de frente, de pies a cabeza, con buena luz y a 2–3 m." });
  }

  if (i.goal === "hypertrophy" && verdict === "perder") {
    items.push({ area: "Objetivo", priority: "media", advice: "Elegiste hipertrofia: con tu % de grasa conviene recomposición (mantenimiento calórico) antes de subir calorías." });
  }
  const headline = verdict === "perder" ? "Enfócate en perder grasa" : verdict === "ganar" ? "Enfócate en ganar masa" : "Enfócate en mejorar tu físico";
  return { verdict, headline, items };
}
