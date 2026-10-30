// Tira horizontal de comparación: la silueta de cada país aislada, ordenadas
// de mayor a menor y escaladas para que el tamaño dibujado sea proporcional al
// valor de la métrica (escala √: área dibujada ∝ valor, la regla honesta para
// símbolos proporcionales). La silueta es el clúster mayor del país (Francia
// enseña el hexágono, no un bbox que abarque la Guayana) y hereda el color de
// clase del choropleth.
import type { LoadedMap } from './geo';
import { countryClusters } from './flags';
import { formatCompact, formatValue, yearLabel, type Metric, type StatsFile } from './stats';
import type { Choropleth } from './choropleth';

const SVG_NS = 'http://www.w3.org/2000/svg';
// El lado mayor de la silueta más grande es --cmp-side (style.css: 110 px, menos en
// pantallas bajas); las demás, una fracción de él, con un mínimo visible (8 de 110 px).
const MIN_FRAC = 8 / 110;

export function renderCompare(
  strip: HTMLElement,
  map: LoadedMap,
  metric: Metric,
  ch: Choropleth,
  stats: StatsFile,
  onSelect: (iso: string) => void,
): void {
  const rows = [...ch.values.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return;
  const vmax = rows[0][1];

  strip.replaceChildren(
    ...rows.flatMap(([iso, value]) => {
      const c = map.countries.get(iso);
      if (!c) return [];
      const clusters = countryClusters(map.svg, c);
      if (!clusters.length) return [];
      const main = clusters.reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a));

      const frac = Math.max(MIN_FRAC, Math.sqrt(value / vmax));
      const dim = Math.max(main.box.w, main.box.h);

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `${main.box.x} ${main.box.y} ${main.box.w} ${main.box.h}`);
      svg.style.width = `calc(var(--cmp-side) * ${((main.box.w / dim) * frac).toFixed(4)})`;
      svg.style.height = `calc(var(--cmp-side) * ${((main.box.h / dim) * frac).toFixed(4)})`;
      const fill = c.el.style.fill || '#737244'; // clase central de la rampa
      for (const piece of main.pieces) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', piece.getAttribute('d') ?? '');
        p.setAttribute('fill', fill);
        svg.appendChild(p);
      }

      const fig = document.createElement('figure');
      fig.className = 'cmp';
      fig.dataset.iso = iso;
      const s = stats.countries[iso];
      fig.title = `${c.name} — ${formatValue(metric, value)} (${s ? yearLabel(metric, s) : '?'})`;
      const caption = document.createElement('figcaption');
      const name = document.createElement('span');
      name.className = 'nm';
      name.textContent = c.name;
      const val = document.createElement('span');
      val.className = 'vl';
      val.textContent = formatCompact(metric, value);
      caption.append(name, val);
      fig.append(svg, caption);
      fig.tabIndex = 0;
      fig.addEventListener('click', () => onSelect(iso));
      fig.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onSelect(iso);
      });
      return [fig];
    }),
  );

  // La rueda desplaza la tira en horizontal (no hay scroll vertical que hacer).
  if (!strip.dataset.wheel) {
    strip.dataset.wheel = '1';
    strip.addEventListener(
      'wheel',
      (e) => {
        if (!e.deltaY) return;
        e.preventDefault();
        strip.scrollLeft += e.deltaY;
      },
      { passive: false },
    );
  }
}

/** Resalta un país en la tira y lo hace visible (clic en el mapa). */
export function highlightCompare(strip: HTMLElement, iso: string): void {
  strip.querySelector('.active')?.classList.remove('active');
  const fig = strip.querySelector(`[data-iso="${iso}"]`);
  if (fig) {
    fig.classList.add('active');
    fig.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}
