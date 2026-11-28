/**
 * trainingProfile.ts (v0.5.1)
 * ----------------------------------------------------------------------------
 * Perfil de entrenamiento DERIVADO de peso, estatura, %grasa y experiencia.
 * Se usa para personalizar rutinas y el análisis físico, de modo que una
 * persona con obesidad NO reciba "intermedio + HIIT con saltos" como todos.
 *
 * Usa IMC (y %grasa si existe, que tiene prioridad al subir la categoría).
 * El IMC no distingue músculo de grasa: por eso el %grasa, si se conoce, manda.
 * Orientativo; no sustituye a un profesional de la salud.
 */
import type { Experience, Gender } from "@/store/settingsStore";

export type BodyTier = "bajo_peso" | "normal" | "sobrepeso" | "obesidad" | "obesidad_alta" | "desconocido";
export type Level = "principiante" | "intermedio" | "avanzado";

export const TIER_LABEL: Record<BodyTier, string> = {
  bajo_peso: "Bajo peso",
  normal: "Peso normal",
  sobrepeso: "Sobrepeso",
  obesidad: "Obesidad",
  obesidad_alta: "Obesidad alta",
  desconocido: "Sin datos"
};

export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm < 100) return null;
  return weightKg / Math.pow(heightCm / 100, 2);
}

const SEVERITY: BodyTier[] = ["bajo_peso", "normal", "sobrepeso", "obesidad", "obesidad_alta"];
const rank = (t: BodyTier) => SEVERITY.indexOf(t);

function tierFromBmi(bmi: number): BodyTier {
  if (bmi < 18.5) return "bajo_peso";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "sobrepeso";
  if (bmi < 35) return "obesidad";
  return "obesidad_alta";
}

function tierFromFat(fat: number, gender: Gender | null): BodyTier {
  const male = gender !== "female";
  if (fat >= (male ? 35 : 45)) return "obesidad_alta";
  if (fat >= (male ? 30 : 40)) return "obesidad";
  if (fat >= (male ? 25 : 32)) return "sobrepeso";
  return "normal";
}

export interface TrainingProfileInput {
  heightCm?: number | null;
  weightKg?: number | null;
  gender?: Gender | null;
  bodyFatPct?: number | null;
  experience?: Experience | null;
}

export interface TrainingProfile {
  bmi: number | null;
  tier: BodyTier;
  tierLabel: string;
  /** Evitar saltos / impacto (rodillas, tobillos, espalda). */
  lowImpact: boolean;
  /** Nivel con el que empezar (puede ser menor al elegido en el perfil). */
  level: Level;
  /** Por qué se aplicó (para mostrarlo al usuario). null si no se adaptó nada. */
  note: string | null;
}

const EXP_TO_LEVEL: Record<Experience, Level> = {
  beginner: "principiante", intermediate: "intermedio", advanced: "avanzado"
};

export function computeTrainingProfile(i: TrainingProfileInput): TrainingProfile {
  const bmi = bmiOf(i.weightKg, i.heightCm);
  let tier: BodyTier = bmi === null ? "desconocido" : tierFromBmi(bmi);

  // El %grasa (si existe) puede SUBIR la categoría (p. ej. IMC normal con mucha grasa).
  // Y puede corregir a un atleta: IMC algo alto pero grasa claramente normal (solo si
  // el usuario dijo tener experiencia y el IMC es < 32).
  if (i.bodyFatPct != null && i.bodyFatPct > 0) {
    const f = tierFromFat(i.bodyFatPct, i.gender ?? null);
    if (bmi === null) tier = f;
    else if (rank(f) > rank(tier)) tier = f;
    else if (
      rank(tier) >= rank("sobrepeso") && rank(f) <= rank("normal") && bmi < 32 &&
      (i.experience === "intermediate" || i.experience === "advanced")
    ) tier = "normal";
  }

  const chosen: Level | null = i.experience ? EXP_TO_LEVEL[i.experience] : null;
  let level: Level = chosen ?? "intermedio";
  let note: string | null = null;

  if (tier === "obesidad_alta") {
    level = "principiante";
    note = `${TIER_LABEL[tier]}${bmi ? ` (IMC ${bmi.toFixed(1)})` : ""}: empiezas en nivel Principiante y sin impacto. Prioriza caminar, bici o natación y fuerza guiada; consulta a tu médico si tienes dolor o condiciones de salud.`;
  } else if (tier === "obesidad") {
    if (chosen !== "avanzado") level = "principiante";
    note = `${TIER_LABEL[tier]}${bmi ? ` (IMC ${bmi.toFixed(1)})` : ""}: rutinas de bajo impacto (sin saltos) y nivel Principiante. Sube la carga poco a poco cada semana.`;
  } else if (tier === "sobrepeso" && i.experience === "beginner") {
    note = `${TIER_LABEL[tier]}: se reduce el impacto mientras ganas base.`;
  } else if (tier === "bajo_peso") {
    note = `${TIER_LABEL[tier]}${bmi ? ` (IMC ${bmi.toFixed(1)})` : ""}: prioriza fuerza con progresión y comer en superávit; evita exceso de cardio.`;
  }

  const lowImpact =
    tier === "obesidad" || tier === "obesidad_alta" ||
    (tier === "sobrepeso" && (i.experience === "beginner"));

  return { bmi, tier, tierLabel: TIER_LABEL[tier], lowImpact, level, note };
}

/** Experiencia sugerida cuando el usuario aún no ha elegido: obesidad → principiante. */
export function suggestExperience(weightKg?: number | null, heightCm?: number | null): Experience {
  const bmi = bmiOf(weightKg, heightCm);
  return bmi !== null && bmi >= 30 ? "beginner" : "intermediate";
}
