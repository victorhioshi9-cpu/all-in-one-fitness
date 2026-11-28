/**
 * physiqueAnalysis.ts
 * Análisis corporal a partir de la pose (ML Kit) de una foto de frente + datos
 * de perfil/báscula. Mide proporciones y simetría; NO estima % de grasa desde
 * la imagen (eso lo da la báscula o el dato manual). Es orientativo.
 */
import type { Gender, Goal } from "@/store/settingsStore";
import { computeTrainingProfile, TIER_LABEL, type BodyTier, type Level } from "@/modules/profile/trainingProfile";

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
  /** Datos de la persona de la foto con los que se calculó (peso, estatura, IMC…). */
  basis?: string;
  tier?: BodyTier;
  level?: Level;
  lowImpact?: boolean;
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
  /** Datos de LA PERSONA DE LA FOTO (no necesariamente el dueño del teléfono). */
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  experience?: "beginner" | "intermediate" | "advanced" | null;
}

export function buildReport(i: ReportInput): PhysiqueReport {
  const male = i.gender !== "female";
  const prof = computeTrainingProfile({
    heightCm: i.heightCm, weightKg: i.weightKg, gender: i.gender,
    bodyFatPct: i.bodyFatPct, experience: i.experience ?? null
  });
  const tier = prof.tier;
  const bmi = prof.bmi;
  const items: FocusItem[] = [];
  let verdict: PhysiqueReport["verdict"] = "mejorar";

  const basisParts: string[] = [];
  if (i.weightKg) basisParts.push(`${Math.round(i.weightKg)} kg`);
  if (i.heightCm) basisParts.push(`${Math.round(i.heightCm)} cm`);
  if (bmi) basisParts.push(`IMC ${bmi.toFixed(1)}`);
  if (i.bodyFatPct) basisParts.push(`${i.bodyFatPct}% grasa`);
  basisParts.push(TIER_LABEL[tier]);
  const basis = basisParts.join(" · ");

  if (tier === "desconocido") {
    items.push({ area: "Datos", priority: "alta",
      advice: "Escribe el peso y la estatura de la persona de la foto. La foto mide proporciones y simetría, pero NO puede saber la grasa corporal: sin esos datos el consejo sería genérico." });
  }

  if (tier === "obesidad_alta" || tier === "obesidad") {
    const high = tier === "obesidad_alta";
    verdict = "perder";
    items.push({ area: "Composición", priority: "alta",
      advice: `Prioridad: BAJAR grasa de forma gradual. Déficit moderado (300–500 kcal), proteína alta (1.6–2 g por kg de peso objetivo) y meta de 0.5–1 % del peso por semana. Sin dietas extremas.` });
    items.push({ area: "Cardio", priority: "alta",
      advice: `Camina 30–45 min casi todos los días (empieza con 10–15 si hace falta), bici estática, elíptica o natación. SIN saltos ni HIIT con impacto al inicio: cuidan rodillas, tobillos y espalda. ${high ? "Sube el tiempo poco a poco." : "Tras 4–6 semanas puedes probar intervalos de bajo impacto (bici)."}` });
    items.push({ area: "Fuerza", priority: "alta",
      advice: "2–3 días de cuerpo completo con máquinas y peso corporal (prensa de pierna, jalón al pecho, press en máquina, remo sentado, plancha inclinada). 2–3 series de 10–12 sin llegar al fallo. Así conservas músculo mientras bajas grasa." });
    items.push({ area: "Salud", priority: high ? "alta" : "media",
      advice: "Si tienes dolor articular, presión alta, diabetes o mareos, consulta a tu médico antes de intensificar. Esto es orientativo, no un diagnóstico." });
  } else if (tier === "sobrepeso") {
    verdict = "perder";
    items.push({ area: "Composición", priority: "alta",
      advice: "Tu prioridad es BAJAR algo de grasa: déficit pequeño (250–400 kcal), proteína alta, pesas 3–4 días y 8–10k pasos. Así conservas músculo." });
    items.push({ area: "Cardio", priority: "media",
      advice: "2–3 sesiones de cardio moderado (caminata rápida, bici). El HIIT es opcional 1 vez por semana y, si notas molestias en rodillas, en su versión sin saltos." });
  } else if (tier === "bajo_peso") {
    verdict = "ganar";
    items.push({ area: "Composición", priority: "alta",
      advice: "Tu prioridad es GANAR masa: superávit de 250–500 kcal, proteína 1.8–2.2 g/kg y entrenamiento de fuerza con progresión. Limita el cardio intenso." });
  } else if (tier === "normal") {
    items.push({ area: "Composición", priority: "media",
      advice: "Composición equilibrada: enfócate en MEJORAR proporciones y fuerza (recomposición o ligero superávit)." });
  }

  const m = i.metrics;
  if (m) {
    const target = male ? 1.35 : 1.15;
    if (m.shoulderHipRatio < target - 0.12) {
      items.push({ area: "Hombros / espalda", priority: "media",
        advice: "Hombros estrechos respecto a la cadera: más volumen en elevaciones laterales, press de hombro, jalones y remos." });
    } else if (m.shoulderHipRatio > target + 0.35 && !male) {
      items.push({ area: "Tren inferior", priority: "media", advice: "Equilibra con más trabajo de glúteo y pierna (hip thrust, prensa, zancadas)." });
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

  items.push({ area: "Nivel recomendado", priority: "baja",
    advice: `${prof.level.charAt(0).toUpperCase() + prof.level.slice(1)}${prof.lowImpact ? " · rutinas de bajo impacto" : ""}.${prof.note ? " " + prof.note : ""}` });

  if (i.goal === "hypertrophy" && verdict === "perder") {
    items.push({ area: "Objetivo", priority: "media", advice: "Elegiste hipertrofia: con este % de grasa conviene recomposición (mantenimiento calórico) antes de subir calorías." });
  }
  const headline =
    tier === "obesidad_alta" ? "Prioriza tu salud: baja grasa poco a poco y sin impacto"
    : tier === "obesidad" ? "Enfócate en perder grasa con bajo impacto"
    : verdict === "perder" ? "Enfócate en perder grasa"
    : verdict === "ganar" ? "Enfócate en ganar masa"
    : "Enfócate en mejorar tu físico";
  // Prioridad "alta" primero.
  const order = { alta: 0, media: 1, baja: 2 } as const;
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  return { verdict, headline, items, basis, tier, level: prof.level, lowImpact: prof.lowImpact };
}
