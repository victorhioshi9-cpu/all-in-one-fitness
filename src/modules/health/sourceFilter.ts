/**
 * sourceFilter.ts
 * ----------------------------------------------------------------------------
 * Lógica para gestionar múltiples sources (Mi Fitness + otros) sin duplicar.
 *
 * Reglas:
 *   1) Cuando un dato del mismo (metric_type, day, started_at) llega desde
 *      2 sources diferentes, GANA el source prioritario (Mi Fitness).
 *   2) Si ambos sources son prioritarios (raro), nos quedamos con el que tenga
 *      `ended_at` más reciente (= lectura más fresca del reloj).
 *   3) Si dos records del MISMO source solapan en tiempo, los agregamos
 *      (sumamos steps/kcal, promediamos HR).
 */
import { PREFERRED_SOURCES, isPreferredSource, type HealthRecord } from "./types";

export interface DedupResult {
  /** Records ganadores tras deduplicación. */
  unique: HealthRecord[];
  /** Records que se descartaron porque el dato ya existía con source prioritario. */
  dropped: HealthRecord[];
}

/**
 * Deduplica un array de HealthRecord aplicando las reglas anteriores.
 * @param records todos los records leídos de HC en una ventana
 */
export function dedupeBySource(records: HealthRecord[]): DedupResult {
  // Bucket key: (metric_type, day?, started_at redondeado a minuto)
  const buckets = new Map<string, HealthRecord[]>();

  for (const r of records) {
    const startedBucket = Math.floor(r.startedAt / 60_000); // 1 min
    const key = `${r.recordType}|${r.day ?? ""}|${startedBucket}`;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }

  const unique: HealthRecord[] = [];
  const dropped: HealthRecord[] = [];

  for (const arr of buckets.values()) {
    if (arr.length === 1) {
      unique.push(arr[0]);
      continue;
    }
    // Ordenar por prioridad de source (Mi Fitness primero), luego por endedAt desc
    const sorted = arr.slice().sort((a, b) => {
      const pa = PREFERRED_SOURCES.indexOf(a.sourceApp ?? "");
      const pb = PREFERRED_SOURCES.indexOf(b.sourceApp ?? "");
      // -1 (no encontrado) va al final
      const ra = pa === -1 ? Number.MAX_SAFE_INTEGER : pa;
      const rb = pb === -1 ? Number.MAX_SAFE_INTEGER : pb;
      if (ra !== rb) return ra - rb;
      return (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt);
    });
    unique.push(sorted[0]);
    dropped.push(...sorted.slice(1));
  }

  return { unique, dropped };
}

/**
 * Para métricas acumulables (steps, kcal) puede que Mi Fitness escriba
 * varios records parciales en el día. Hay que sumarlos en vez de deduplicar.
 */
export function sumAccumulables(records: HealthRecord[]): HealthRecord {
  if (records.length === 0) {
    throw new Error("sumAccumulables: empty input");
  }
  const total = records.reduce((sum, r) => sum + r.value, 0);
  const first = records[0];
  return {
    ...first,
    value: total,
    startedAt: Math.min(...records.map((r) => r.startedAt)),
    endedAt: Math.max(...records.map((r) => r.endedAt ?? r.startedAt)),
    rawMeta: { components: records.map((r) => ({ value: r.value, sourceApp: r.sourceApp, startedAt: r.startedAt })) }
  };
}

/**
 * Para HR toma el promedio ponderado por duración de cada sample.
 */
export function averageHeartRate(records: HealthRecord[]): HealthRecord {
  if (records.length === 0) throw new Error("averageHeartRate: empty");
  let weighted = 0;
  let totalWeight = 0;
  for (const r of records) {
    const dur = (r.endedAt ?? r.startedAt) - r.startedAt;
    const w = Math.max(1000, dur); // si no hay duración, pesa 1 segundo
    weighted += r.value * w;
    totalWeight += w;
  }
  return {
    ...records[0],
    value: Math.round(weighted / totalWeight),
    startedAt: Math.min(...records.map((r) => r.startedAt)),
    endedAt: Math.max(...records.map((r) => r.endedAt ?? r.startedAt)),
    rawMeta: { samples: records.length }
  };
}

/**
 * Extrae la source app de un record crudo de la librería react-native-health-connect.
 * Cada record tiene `metadata.dataOrigin` con el packageName del source.
 */
export function extractSourceApp(rawRecord: any): string | undefined {
  return (
    rawRecord?.metadata?.dataOrigin ??
    rawRecord?.dataOrigin ??
    rawRecord?.sourceApp ??
    undefined
  );
}
