// Pipeline de estadísticas: población y superficie por país → public/data/stats.json.
// Fuente primaria: Banco Mundial (SP.POP.TOTL, AG.SRF.TOTL.K2), el dato más
// reciente disponible por país. Respaldo para territorios que el BM no cubre
// (Taiwán, Sáhara Occidental, dependencias…): POP_EST de Natural Earth y área
// geodésica calculada sobre la propia geometría con mapshaper.
// Las respuestas del BM se cachean en data/cache/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mapshaper from 'mapshaper';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, 'data', 'cache');
const outFile = path.join(root, 'public', 'data', 'stats.json');
mkdirSync(cacheDir, { recursive: true });

const WB = 'https://api.worldbank.org/v2';
// Rango amplio: se toma el último año con dato por país. Ojo: mrnev=1 con
// SP.POP.TOTL devuelve un error del servidor, por eso se usa rango de fechas.
const YEARS = '2015:2030';

async function wbJson(url, cacheName) {
  const cache = path.join(cacheDir, cacheName);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  console.log(`Descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  // El BM responde con BOM UTF-8; quitarlo antes de parsear.
  const data = JSON.parse((await res.text()).replace(/^﻿/, ''));
  writeFileSync(cache, JSON.stringify(data));
  return data;
}

// iso3 → iso2 (minúsculas), solo países reales (region NA = agregados tipo "Euro area").
async function wbCountries() {
  const [, rows] = await wbJson(`${WB}/country?format=json&per_page=400`, 'wb-countries.json');
  const map = new Map();
  for (const r of rows) {
    if (r.region.id !== 'NA' && r.iso2Code?.length === 2) {
      map.set(r.id, r.iso2Code.toLowerCase());
    }
  }
  return map;
}

// Último valor no nulo por iso3 para un indicador del BM.
async function wbIndicator(indicator) {
  const url = `${WB}/country/all/indicator/${indicator}?format=json&per_page=10000&date=${YEARS}`;
  const [, rows] = await wbJson(url, `wb-${indicator}.json`);
  const latest = new Map();
  for (const r of rows) {
    if (r.value === null || !r.countryiso3code) continue;
    const prev = latest.get(r.countryiso3code);
    if (!prev || r.date > prev.year) latest.set(r.countryiso3code, { value: r.value, year: r.date });
  }
  return latest;
}

// Respaldo Natural Earth: POP_EST y área geodésica (this.area es m² en datos
// lon/lat) desde el shapefile ya cacheado por build-maps.
async function neFallback() {
  const shp = path.join(cacheDir, 'ne_50m_admin_0_countries', 'ne_50m_admin_0_countries.shp');
  if (!existsSync(shp)) throw new Error('Falta el shapefile de Natural Earth: ejecuta antes npm run build:maps');
  const cmd =
    `-i "${shp}" ` +
    `-each "iso = (ISO_A2_EH && ISO_A2_EH.length === 2) ? ISO_A2_EH.toLowerCase() : null; ` +
    `pop = POP_EST; area = Math.round(this.area / 1e6)" ` +
    '-filter "iso !== null" -filter-fields iso,pop,area -o out.json format=json';
  const result = await mapshaper.applyCommands(cmd);
  const rows = JSON.parse(result['out.json']);
  const map = new Map();
  for (const r of rows) {
    const prev = map.get(r.iso);
    // Features duplicadas del mismo ISO: sumar área, quedarse con la mayor población.
    if (prev) map.set(r.iso, { pop: Math.max(prev.pop, r.pop), area: prev.area + r.area });
    else map.set(r.iso, { pop: r.pop, area: r.area });
  }
  return map;
}

const [iso3to2, pop, area, ne] = await Promise.all([
  wbCountries(),
  wbIndicator('SP.POP.TOTL'),
  wbIndicator('AG.SRF.TOTL.K2'),
  neFallback(),
]);

const wbPop = new Map();
const wbArea = new Map();
for (const [iso3, v] of pop) {
  const iso2 = iso3to2.get(iso3);
  if (iso2) wbPop.set(iso2, v);
}
for (const [iso3, v] of area) {
  const iso2 = iso3to2.get(iso3);
  if (iso2) wbArea.set(iso2, v);
}

// El universo de países es el del mapa (Natural Earth): así todo país pintable
// tiene entrada, con dato del BM si existe y de NE si no.
const countries = {};
let fromNe = 0;
for (const [iso, neVal] of [...ne].sort()) {
  const p = wbPop.get(iso);
  const a = wbArea.get(iso);
  if (!p || !a) fromNe++;
  // *Year null = el dato viene del respaldo Natural Earth, no del BM.
  countries[iso] = {
    pop: p ? Math.round(p.value) : neVal.pop,
    popYear: p ? Number(p.year) : null,
    area: a ? Math.round(a.value) : neVal.area,
    areaYear: a ? Number(a.year) : null,
  };
}

writeFileSync(
  outFile,
  JSON.stringify({
    meta: {
      sources: 'Banco Mundial · respaldo Natural Earth',
      updated: new Date().toISOString().slice(0, 10),
    },
    countries,
  }),
);
console.log(
  `✓ ${Object.keys(countries).length} países → ${path.relative(root, outFile)} (${fromNe} con respaldo NE)`,
);
