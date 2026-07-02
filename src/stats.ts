// Estadísticas por país (población, superficie, densidad) generadas por
// scripts/build-stats.mjs: Banco Mundial con respaldo Natural Earth.
export interface CountryStats {
  pop: number;
  popYear: number | null; // null = respaldo Natural Earth, no Banco Mundial
  area: number;
  areaYear: number | null;
}

export interface StatsFile {
  meta: { sources: string; updated: string };
  countries: Record<string, CountryStats>;
}

export type Metric = 'area' | 'pop' | 'density';

export const METRICS: Record<Metric, { name: string; unit: string; value: (s: CountryStats) => number }> = {
  area: { name: 'Superficie', unit: 'km²', value: (s) => s.area },
  pop: { name: 'Población', unit: 'hab.', value: (s) => s.pop },
  density: { name: 'Densidad', unit: 'hab/km²', value: (s) => (s.area > 0 ? s.pop / s.area : 0) },
};

export function isMetric(v: string): v is Metric {
  return v in METRICS;
}

let cached: Promise<StatsFile> | undefined;

export function loadStats(): Promise<StatsFile> {
  cached ??= fetch('data/stats.json').then((r) => {
    if (!r.ok) throw new Error('No se pudo cargar data/stats.json (ejecuta npm run build:stats)');
    return r.json() as Promise<StatsFile>;
  });
  return cached;
}

const whole = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });

export function formatValue(metric: Metric, v: number): string {
  const num = metric === 'density' && v < 100 ? decimal.format(v) : whole.format(v);
  return `${num} ${METRICS[metric].unit}`;
}

export function formatCompact(metric: Metric, v: number): string {
  return `${compact.format(v)} ${METRICS[metric].unit}`;
}

/** Año del dato para la métrica ("2025") o su origen si no es del BM. */
export function yearLabel(metric: Metric, s: CountryStats): string {
  const year = metric === 'area' ? s.areaYear : s.popYear;
  return year ? String(year) : 'est. Natural Earth';
}
