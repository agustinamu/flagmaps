// Lista de países ordenada por la métrica activa (mayor → menor).
import type { LoadedMap } from './geo';
import { formatValue, type Metric } from './stats';
import type { Choropleth } from './choropleth';

export function renderRanking(
  list: HTMLElement,
  map: LoadedMap,
  metric: Metric,
  ch: Choropleth,
  onSelect: (iso: string) => void,
): void {
  const rows = [...ch.values.entries()]
    .map(([iso, value]) => ({ iso, value, name: map.countries.get(iso)?.name ?? iso }))
    .sort((a, b) => b.value - a.value);

  list.replaceChildren(
    ...rows.map((r, i) => {
      const li = document.createElement('li');
      li.dataset.iso = r.iso;
      const rank = document.createElement('span');
      rank.className = 'rk';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'nm';
      name.textContent = r.name;
      const value = document.createElement('span');
      value.className = 'vl';
      value.textContent = formatValue(metric, r.value);
      li.append(rank, name, value);
      li.addEventListener('click', () => onSelect(r.iso));
      return li;
    }),
  );
}

/** Resalta un país en la lista y lo hace visible (clic en el mapa). */
export function highlightRanking(list: HTMLElement, iso: string): void {
  list.querySelector('.active')?.classList.remove('active');
  const row = list.querySelector(`[data-iso="${iso}"]`);
  if (row) {
    row.classList.add('active');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
