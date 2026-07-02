import './style.css';
import { MAPS, type MapDef } from './data/maps';
import { loadMap, type CountryEl, type LoadedMap } from './geo';
import {
  applyFlag,
  removeFlag,
  flagUrl,
  clusterPieces,
  mapDiagonal,
  CLUSTER_GAP,
} from './flags';
import { loadSelection, saveSelection } from './state';
import { enableZoomPan, type ZoomPan } from './zoompan';
import { exportPNG, exportSVG } from './exporter';
import {
  loadStats,
  formatValue,
  yearLabel,
  isMetric,
  METRICS,
  type Metric,
  type StatsFile,
} from './stats';
import { paintChoropleth, clearChoropleth, renderLegend, type Choropleth } from './choropleth';
import { renderRanking, highlightRanking } from './ranking';
import { renderCompare, highlightCompare } from './compare';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Falta el elemento ${sel}`);
  return el;
};

const container = $('#map-viewport');
const tooltip = $('#tooltip');
const ttFlag = $<HTMLImageElement>('#tt-flag');
const ttName = $('#tt-name');
const ttStats = $('#tt-stats');
const countEl = $('#count');
const totalEl = $('#total');
const searchInput = $<HTMLInputElement>('#search');
const mapSelect = $<HTMLSelectElement>('#map-select');
const modeBar = $('#mode-bar');
const viewBar = $('#view-bar');
const legend = $('#legend');
const compareEl = $('#compare');
const rankingEl = $('#ranking');
const rankingTitle = $('#ranking-title');
const rankingList = $('#ranking-list');
const datalist = $('#country-list');

type Mode = 'flags' | Metric;
type View = 'list' | 'strip';

interface Ctx {
  def: MapDef;
  map: LoadedMap;
  selected: Set<string>;
  zoomPan: ZoomPan;
}
let ctx: Ctx;
let mode: Mode = 'flags';
let view: View = 'list';
let choropleth: Choropleth | undefined;
let stats: StatsFile | undefined; // para el tooltip en cualquier modo

function updateCounter(): void {
  countEl.textContent = String(ctx.selected.size);
}

function persist(): void {
  saveSelection(ctx.def.id, ctx.selected);
  updateCounter();
}

async function select(c: CountryEl): Promise<void> {
  ctx.selected.add(c.iso);
  try {
    await applyFlag(ctx.map.svg, c);
  } catch (err) {
    // Bandera inaccesible (red caída, SVG ausente): revertir, no dejar estado fantasma.
    ctx.selected.delete(c.iso);
    console.error(err);
  }
}

async function toggle(c: CountryEl): Promise<void> {
  if (ctx.selected.has(c.iso)) {
    ctx.selected.delete(c.iso);
    removeFlag(ctx.map.svg, c);
  } else {
    await select(c);
  }
  persist();
}

function countryFromEvent(e: Event): CountryEl | undefined {
  const target = (e.target as Element).closest<SVGGElement>('.country');
  return target ? ctx.map.countries.get(target.id) : undefined;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function flash(c: CountryEl): void {
  c.el.classList.remove('flash');
  void c.el.getBBox(); // reinicia la animación
  c.el.classList.add('flash');
}

// Centra la vista en la masa principal del país (Francia → el hexágono).
function focusCountry(c: CountryEl): void {
  const clusters = clusterPieces(c.pieces, mapDiagonal(ctx.map.svg) * CLUSTER_GAP);
  if (!clusters.length) return;
  const main = clusters.reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a));
  ctx.zoomPan.focus(main.box);
  flash(c);
}

// Clic en la lista o en la tira: localizar el país en el mapa.
function selectFromViews(iso: string): void {
  const c = ctx.map.countries.get(iso);
  if (!c) return;
  focusCountry(c);
  highlightRanking(rankingList, iso);
  highlightCompare(compareEl, iso);
}

// Aplica el modo activo al mapa cargado: banderas o choropleth de una métrica
// (los rellenos de bandera quedan intactos debajo; el CSS de .data-mode manda).
async function applyMode(): Promise<void> {
  tooltip.hidden = true;
  if (mode === 'flags') {
    ctx.map.svg.classList.remove('data-mode');
    document.body.classList.remove('mode-data');
    clearChoropleth(ctx.map);
    choropleth = undefined;
    legend.hidden = true;
    rankingEl.hidden = true;
    compareEl.hidden = true;
    return;
  }
  stats = await loadStats();
  choropleth = paintChoropleth(ctx.map, stats, mode);
  ctx.map.svg.classList.add('data-mode');
  document.body.classList.add('mode-data');
  renderLegend(legend, mode, choropleth, stats);
  if (view === 'list') {
    rankingTitle.textContent = METRICS[mode].name;
    renderRanking(rankingList, ctx.map, mode, choropleth, selectFromViews);
    rankingEl.hidden = false;
    compareEl.hidden = true;
  } else {
    renderCompare(compareEl, ctx.map, mode, choropleth, stats, selectFromViews);
    compareEl.hidden = false;
    rankingEl.hidden = true;
  }
}

// Rellena las tres métricas del tooltip y resalta la del modo activo.
function fillTooltipStats(iso: string): void {
  const s = stats?.countries[iso];
  ttStats.hidden = !s;
  if (!s) return;
  for (const row of ttStats.querySelectorAll<HTMLElement>('[data-metric]')) {
    const metric = row.dataset.metric as Metric;
    const dd = row.querySelector('dd');
    if (dd) {
      const year = metric === 'density' ? '' : ` · ${yearLabel(metric, s)}`;
      dd.textContent = `${formatValue(metric, METRICS[metric].value(s))}${year}`;
    }
    row.classList.toggle('hl', metric === mode);
  }
}

let loadSeq = 0;

async function showMap(def: MapDef): Promise<void> {
  const seq = ++loadSeq;
  const map = await loadMap(def, container);
  if (seq !== loadSeq) return; // el usuario cambió de mapa mientras cargaba
  const selected = loadSelection(def.id);
  ctx = { def, map, selected, zoomPan: enableZoomPan(map.svg) };
  map.svg.dataset.homeViewbox = map.svg.getAttribute('viewBox') ?? '';

  totalEl.textContent = String(map.countries.size);
  await Promise.all(
    [...selected].map((iso) => {
      const c = map.countries.get(iso);
      if (c) return select(c);
      selected.delete(iso);
      return undefined;
    }),
  );
  updateCounter();

  datalist.replaceChildren(
    ...[...map.countries.values()].map((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      return opt;
    }),
  );

  map.svg.addEventListener('click', (e) => {
    if (ctx.zoomPan.wasDragged()) return;
    const c = countryFromEvent(e);
    if (!c) return;
    if (mode === 'flags') void toggle(c);
    else {
      highlightRanking(rankingList, c.iso);
      highlightCompare(compareEl, c.iso);
    }
  });

  let hoveredKey = '';
  map.svg.addEventListener('mousemove', (e) => {
    const c = countryFromEvent(e);
    if (!c) {
      tooltip.hidden = true;
      hoveredKey = '';
      return;
    }
    const key = `${c.iso}:${mode}`;
    if (key !== hoveredKey) {
      hoveredKey = key;
      ttName.textContent = c.name;
      ttFlag.src = flagUrl(c.iso);
      fillTooltipStats(c.iso);
    }
    tooltip.hidden = false;
    // Pegado al cursor pero sin salirse de la ventana.
    const pad = 14;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + tooltip.offsetWidth > innerWidth) x = e.clientX - pad - tooltip.offsetWidth;
    if (y + tooltip.offsetHeight > innerHeight) y = e.clientY - pad - tooltip.offsetHeight;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
  map.svg.addEventListener('mouseleave', () => {
    tooltip.hidden = true;
    hoveredKey = '';
  });

  await applyMode();
}

function init(): void {
  mapSelect.replaceChildren(
    ...MAPS.map((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      return opt;
    }),
  );
  mapSelect.addEventListener('change', () => {
    const def = MAPS.find((m) => m.id === mapSelect.value);
    if (def) void showMap(def);
  });

  modeBar.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-mode]');
    if (!btn) return;
    const m = btn.dataset.mode ?? 'flags';
    mode = isMetric(m) ? m : 'flags';
    for (const b of modeBar.querySelectorAll('.mode')) b.classList.toggle('active', b === btn);
    applyMode().catch(console.error);
  });

  viewBar.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-view]');
    if (!btn) return;
    view = btn.dataset.view === 'strip' ? 'strip' : 'list';
    for (const b of viewBar.querySelectorAll('.view')) b.classList.toggle('active', b === btn);
    applyMode().catch(console.error);
  });

  searchInput.addEventListener('change', () => {
    const query = normalize(searchInput.value.trim());
    if (!query) return;
    const match = [...ctx.map.countries.values()].find((c) => normalize(c.name) === query);
    if (!match) return;
    if (mode === 'flags') void toggle(match);
    focusCountry(match);
    searchInput.value = '';
  });

  $('#btn-all').addEventListener('click', async () => {
    const pending = [...ctx.map.countries.values()].filter((c) => !ctx.selected.has(c.iso));
    await Promise.all(pending.map(select));
    persist();
  });

  $('#btn-clear').addEventListener('click', () => {
    for (const c of ctx.map.countries.values()) removeFlag(ctx.map.svg, c);
    ctx.selected.clear();
    persist();
  });

  $('#btn-reset-view').addEventListener('click', () => ctx.zoomPan.reset());
  $('#btn-svg').addEventListener('click', () => exportSVG(ctx.map.svg, ctx.def.id));
  $('#btn-png').addEventListener('click', () => void exportPNG(ctx.map.svg, ctx.def.id));

  // Las estadísticas alimentan el tooltip en todos los modos.
  loadStats()
    .then((s) => (stats = s))
    .catch(console.error);

  void showMap(MAPS[0]);
}

init();
