// Pipeline de datos: Natural Earth → TopoJSON por mapa según data/maps.config.json.
// Descarga el shapefile (con caché en data/cache/), lo procesa con mapshaper y
// emite public/data/<mapa>.json con propiedades saneadas:
//   iso (ISO_A2_EH en minúsculas, null si no hay código), name (NAME_ES),
//   continent, subregion.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mapshaper from 'mapshaper';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, 'data', 'cache');
const outDir = path.join(root, 'public', 'data');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const config = JSON.parse(readFileSync(path.join(root, 'data', 'maps.config.json'), 'utf8'));

// Descarga (con caché) y descomprime el shapefile; devuelve la ruta al .shp.
// El zip trae una capa "VERSION" sin campos que confunde a mapshaper, por eso
// se apunta directamente al .shp.
async function fetchNaturalEarth(scale) {
  const base = `ne_${scale}_admin_0_countries`;
  const zip = path.join(cacheDir, `${base}.zip`);
  const shp = path.join(cacheDir, base, `${base}.shp`);
  if (existsSync(shp)) return shp;
  if (!existsSync(zip)) {
    const url = `https://naciscdn.org/naturalearth/${scale}/cultural/${base}.zip`;
    console.log(`Descargando ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
  }
  execFileSync('unzip', ['-o', '-q', zip, '-d', path.join(cacheDir, base)]);
  return shp;
}

const SANITIZE =
  "iso = (ISO_A2_EH && ISO_A2_EH.length === 2) ? ISO_A2_EH.toLowerCase() : null; " +
  'name = NAME_ES || NAME; continent = CONTINENT; subregion = SUBREGION';

for (const [id, def] of Object.entries(config)) {
  const shp = await fetchNaturalEarth(def.source);
  const out = path.join(outDir, `${id}.json`);
  const cmd = [
    `-i "${shp}"`,
    def.clipBbox ? `-clip bbox=${def.clipBbox.join(',')}` : '',
    def.filter ? `-filter "${def.filter.replaceAll('"', '\\"')}"` : '',
    `-each "${SANITIZE}"`,
    '-filter-fields iso,name,continent,subregion',
    '-rename-layers countries',
    `-o format=topojson quantization=1e5 "${out}"`,
  ]
    .filter(Boolean)
    .join(' ');
  await mapshaper.runCommands(cmd);
  console.log(`✓ ${id} → ${path.relative(root, out)}`);
}
