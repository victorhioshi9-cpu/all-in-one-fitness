/**
 * units.ts
 * ----------------------------------------------------------------------------
 * Conversión robusta de las unidades que devuelve react-native-health-connect.
 *
 * CAUSA DEL BUG "1.188.000 kcal activas":
 *   La librería devuelve la energía como un objeto con VARIAS representaciones
 *   a la vez: { inCalories, inJoules, inKilocalories, inKilojoules } (o bien
 *   { value, unit }). El código anterior leía `inCalories` ANTES que
 *   `inKilocalories`, y `inCalories` son calorías pequeñas (1 kcal = 1000 cal),
 *   por eso 1188 kcal salían como 1.188.000.
 *
 * Aquí se prioriza siempre la representación en la unidad correcta y, si solo
 * llega { value, unit }, se convierte según `unit`.
 */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Energía → kilocalorías. */
export function energyToKcal(e: any): number {
  if (isNum(e)) return e; // número suelto: se asume kcal
  if (!e || typeof e !== "object") return 0;
  if (isNum(e.inKilocalories)) return e.inKilocalories;
  if (isNum(e.inCalories)) return e.inCalories / 1000;
  if (isNum(e.inKilojoules)) return e.inKilojoules / 4.184;
  if (isNum(e.inJoules)) return e.inJoules / 4184;
  if (isNum(e.value)) {
    const u = String(e.unit ?? "kilocalories").toLowerCase();
    if (u === "calories" || u === "cal") return e.value / 1000;
    if (u === "joules" || u === "j") return e.value / 4184;
    if (u === "kilojoules" || u === "kj") return e.value / 4.184;
    return e.value; // kilocalories / kcal / desconocida
  }
  return 0;
}

/** Potencia (BMR de HC) → kcal/día. */
export function powerToKcalPerDay(p: any): number {
  if (isNum(p)) return p;
  if (!p || typeof p !== "object") return 0;
  if (isNum(p.inKilocaloriesPerDay)) return p.inKilocaloriesPerDay;
  if (isNum(p.inWatts)) return (p.inWatts * 86400) / 4184;
  if (isNum(p.value)) {
    const u = String(p.unit ?? "kilocaloriesPerDay").toLowerCase();
    if (u.includes("watt")) return (p.value * 86400) / 4184;
    return p.value;
  }
  return 0;
}

/** Masa → kg. */
export function massToKg(m: any): number {
  if (isNum(m)) return m;
  if (!m || typeof m !== "object") return 0;
  if (isNum(m.inKilograms)) return m.inKilograms;
  if (isNum(m.inGrams)) return m.inGrams / 1000;
  if (isNum(m.inPounds)) return m.inPounds * 0.45359237;
  if (isNum(m.inOunces)) return m.inOunces * 0.0283495231;
  if (isNum(m.value)) {
    const u = String(m.unit ?? "kilograms").toLowerCase();
    if (u.startsWith("gram")) return m.value / 1000;
    if (u.startsWith("pound")) return m.value * 0.45359237;
    if (u.startsWith("ounce")) return m.value * 0.0283495231;
    return m.value;
  }
  return 0;
}

/** Longitud → metros. */
export function lengthToMeters(l: any): number {
  if (isNum(l)) return l;
  if (!l || typeof l !== "object") return 0;
  if (isNum(l.inMeters)) return l.inMeters;
  if (isNum(l.inKilometers)) return l.inKilometers * 1000;
  if (isNum(l.inInches)) return l.inInches * 0.0254;
  if (isNum(l.inFeet)) return l.inFeet * 0.3048;
  if (isNum(l.value)) {
    const u = String(l.unit ?? "meters").toLowerCase();
    if (u.startsWith("centi")) return l.value / 100;
    if (u.startsWith("inch")) return l.value * 0.0254;
    if (u.startsWith("feet") || u.startsWith("foot")) return l.value * 0.3048;
    if (u.startsWith("kilo")) return l.value * 1000;
    return l.value;
  }
  return 0;
}

/** Porcentaje (BodyFat de HC): puede venir como número o como { value }. */
export function percentValue(p: any): number {
  if (isNum(p)) return p;
  if (p && typeof p === "object") {
    if (isNum(p.value)) return p.value;
    if (isNum(p.percentage)) return p.percentage;
  }
  return 0;
}
