// Render del mapa: TopoJSON (Natural Earth) → SVG con d3-geo.
// Cada polígono del MultiPolygon de un país se emite como un <path> propio
// (pieza): los agujeros son anillos interiores del polígono y los gestiona
// d3 directamente, sin parsear nada.
import { geoConicConformal, geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { MapDef, ProjectionDef } from './data/maps';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 540;
const PAD = 10;

interface CountryProps {
  iso: string | null;
  name: string;
  continent: string;
  subregion: string;
}

export interface CountryEl {
  iso: string;
  name: string;
  el: SVGGElement;
  pieces: SVGPathElement[];
}

export interface LoadedMap {
  svg: SVGSVGElement;
  countries: Map<string, CountryEl>;
}

function makeProjection(def: ProjectionDef): GeoProjection {
  switch (def.type) {
    case 'equalEarth':
      return geoEqualEarth();
    case 'conicConformal':
      return geoConicConformal()
        .rotate(def.rotate ?? [0, 0])
        .parallels(def.parallels ?? [30, 60]);
  }
}

export async function loadMap(def: MapDef, container: HTMLElement): Promise<LoadedMap> {
  const res = await fetch(`data/${def.id}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar data/${def.id}.json`);
  const topo = (await res.json()) as Topology;
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<
    Polygon | MultiPolygon,
    CountryProps
  >;

  const projection = makeProjection(def.projection).fitExtent(
    [
      [PAD, PAD],
      [W - PAD, H - PAD],
    ],
    fc,
  );
  const toPath = geoPath(projection);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Silueta del planeta (solo tiene sentido en proyecciones de mundo completo).
  if (def.projection.type === 'equalEarth') {
    const sphere = document.createElementNS(SVG_NS, 'path');
    sphere.setAttribute('d', toPath({ type: 'Sphere' }) ?? '');
    sphere.setAttribute('class', 'sphere');
    sphere.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(sphere);
  }

  const countries = new Map<string, CountryEl>();
  for (const f of fc.features) {
    const polys: Polygon['coordinates'][] =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

    const pieces: SVGPathElement[] = [];
    for (const coordinates of polys) {
      const d = toPath({ type: 'Polygon', coordinates });
      if (!d) continue; // pieza fuera del recorte de la proyección
      const piece = document.createElementNS(SVG_NS, 'path');
      piece.setAttribute('d', d);
      // Grosor de frontera constante en pantalla: al acercar, el trazo no
      // engorda ni se traga a los microestados (Andorra, Mónaco).
      piece.setAttribute('vector-effect', 'non-scaling-stroke');
      pieces.push(piece);
    }
    if (!pieces.length) continue;

    const iso = f.properties.iso;
    if (!iso) {
      // Territorios sin código ISO (disputados): tierra no interactiva.
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'land');
      g.append(...pieces);
      svg.appendChild(g);
      continue;
    }

    const existing = countries.get(iso);
    if (existing) {
      // Varias features con el mismo ISO se fusionan en un solo país.
      existing.el.append(...pieces);
      existing.pieces.push(...pieces);
      continue;
    }

    const g = document.createElementNS(SVG_NS, 'g');
    g.id = iso;
    g.setAttribute('class', 'country');
    g.dataset.name = f.properties.name;
    g.append(...pieces);
    svg.appendChild(g);
    countries.set(iso, { iso, name: f.properties.name, el: g, pieces });
  }

  container.replaceChildren(svg);
  return { svg, countries };
}
