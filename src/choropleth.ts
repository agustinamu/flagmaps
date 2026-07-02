// Coloreado del mapa por magnitud (choropleth) con leyenda. Rampa secuencial
// de un solo tono (latón, OKLCH L 0.38→0.87) en 7 clases por cuantiles:
// población, superficie y densidad son distribuciones tan sesgadas que una
// escala lineal (o incluso log continua) deja casi todos los países en el
// mismo color; los cuantiles reparten los países por igual entre clases.
// El color se aplica al <g> del país; en modo datos el CSS fuerza a las piezas
// a heredarlo, de modo que los rellenos de bandera quedan intactos debajo.
import type { LoadedMap } from './geo';
import { METRICS, formatCompact, type Metric, type StatsFile } from './stats';

const RAMP = ['#4f4026', '#6a5530', '#876b3b', '#a58245', '#c49a50', '#e1b25f', '#fccc79'];

export interface Choropleth {
  /** Valor de la métrica por iso (solo países presentes en el mapa con datos). */
  values: Map<string, number>;
}

export function paintChoropleth(map: LoadedMap, stats: StatsFile, metric: Metric): Choropleth {
  const metricOf = METRICS[metric].value;
  const values = new Map<string, number>();
  for (const iso of map.countries.keys()) {
    const s = stats.countries[iso];
    if (s) values.set(iso, metricOf(s));
  }

  const sorted = [...values.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const classOf = (v: number): number => {
    let lo = 0;
    let hi = sorted.length; // primer índice con sorted[i] > v
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(RAMP.length - 1, Math.floor(((lo - 1) / sorted.length) * RAMP.length));
  };

  for (const c of map.countries.values()) {
    const v = values.get(c.iso);
    // Sin datos (o cero): conserva el gris azulado base del mapa.
    c.el.style.fill = v ? RAMP[classOf(v)] : '';
  }
  return { values };
}

export function clearChoropleth(map: LoadedMap): void {
  for (const c of map.countries.values()) c.el.style.fill = '';
}

export function renderLegend(
  el: HTMLElement,
  metric: Metric,
  ch: Choropleth,
  stats: StatsFile,
): void {
  const sorted = [...ch.values.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const min = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  el.replaceChildren();

  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = `${METRICS[metric].name} · 7 clases por cuantiles`;

  const bar = document.createElement('div');
  bar.className = 'legend-bar';
  for (const color of RAMP) {
    const swatch = document.createElement('span');
    swatch.style.background = color;
    bar.appendChild(swatch);
  }

  const labels = document.createElement('div');
  labels.className = 'legend-labels';
  for (const v of [min, median, max]) {
    const span = document.createElement('span');
    span.textContent = formatCompact(metric, v);
    labels.appendChild(span);
  }

  const source = document.createElement('div');
  source.className = 'legend-source';
  source.textContent = `fuente: ${stats.meta.sources} · ${stats.meta.updated.slice(0, 4)}`;

  el.append(title, bar, labels, source);
  el.hidden = false;
}
