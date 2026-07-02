// Sincroniza el pack local de banderas con los códigos ISO presentes en los
// TopoJSON generados: reutiliza las del proyecto v1 si existen y descarga de
// flagcdn las que falten.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'public', 'data');
const flagsDir = path.join(root, 'public', 'flags');
const v1Flags = path.join(root, '..', 'countryoftheworld', 'public', 'flags');
mkdirSync(flagsDir, { recursive: true });

const isos = new Set();
for (const f of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  const topo = JSON.parse(readFileSync(path.join(dataDir, f), 'utf8'));
  for (const geom of topo.objects.countries.geometries) {
    if (geom.properties?.iso) isos.add(geom.properties.iso);
  }
}

let copied = 0;
let downloaded = 0;
const failed = [];
for (const iso of [...isos].sort()) {
  const dest = path.join(flagsDir, `${iso}.svg`);
  if (existsSync(dest)) continue;
  const v1 = path.join(v1Flags, `${iso}.svg`);
  if (existsSync(v1)) {
    copyFileSync(v1, dest);
    copied++;
    continue;
  }
  const res = await fetch(`https://flagcdn.com/${iso}.svg`);
  if (!res.ok) {
    failed.push(iso);
    continue;
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  downloaded++;
}

console.log(`Códigos en mapas: ${isos.size} · copiadas de v1: ${copied} · descargadas: ${downloaded}`);
if (failed.length) console.warn(`Sin bandera disponible: ${failed.join(', ')}`);
