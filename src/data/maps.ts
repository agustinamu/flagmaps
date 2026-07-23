// Mapas disponibles: misma fuente de verdad que el pipeline de build
// (data/maps.config.json). Añadir un mapa = una entrada allí + npm run build:maps.
import config from '../../data/maps.config.json';

// Solo proyecciones que renderizan sin roturas (vacías o rotas) en los 7
// mapas disponibles. Se descartaron albersUSA (composición fija para EE.UU.,
// falla fuera de él), orthographic/gnomonic/stereographic (se centran en
// (0,0) por defecto y quedan vacías en Norteamérica, Sudamérica y Oceanía).
export type ProjectionType =
  | 'equalEarth'
  | 'conicConformal'
  | 'conicEqualArea'
  | 'conicEquidistant'
  | 'mercator'
  | 'transverseMercator'
  | 'naturalEarth1'
  | 'mollweide'
  | 'equirectangular'
  | 'azimuthalEquidistant'
  | 'albersEqualArea';

export interface ProjectionDef {
  type: ProjectionType;
  rotate?: [number, number];
  center?: [number, number];
  parallels?: [number, number];
  scale?: number;
  translate?: [number, number];
}

export interface MapDef {
  id: string;
  name: string;
  // La proyección no viene del config: se elige en la UI (ver DEFAULT_PROJECTIONS).
}

interface RawMapConfig {
  name: string;
  source?: string;
  filter?: string;
  clipBbox?: number[];
}

// Proyección con la que arranca cada mapa al seleccionarlo; el usuario puede
// cambiarla luego desde el selector de proyección sin perder este ajuste fino
// (rotate/parallels) si vuelve a elegir el tipo por defecto.
export const DEFAULT_PROJECTIONS: Record<string, ProjectionDef> = {
  world: { type: 'equalEarth' },
  europe: { type: 'conicConformal', rotate: [-15, 0], parallels: [40, 60] },
  africa: { type: 'equirectangular' },
  asia: { type: 'equirectangular' },
  // Cónica conforme descartada aquí: el continente va de Panamá a Groenlandia
  // (8°N a 83°N), un rango de latitud demasiado ancho para un cono calibrado
  // (rompe el orden norte-sur y el continente aparece partido).
  'north-america': { type: 'equalEarth' },
  'south-america': { type: 'conicConformal', rotate: [-60, 0], parallels: [-5, -42] },
  oceania: { type: 'equirectangular' },
};

export const MAPS: MapDef[] = Object.entries(config as unknown as Record<string, RawMapConfig>).map(
  ([id, def]) => ({ id, name: def.name }),
);

export const PROJECTION_LABELS: Record<ProjectionType, string> = {
  equalEarth: 'Equal Earth',
  naturalEarth1: 'Natural Earth I',
  mollweide: 'Mollweide',
  equirectangular: 'Equirectangular',
  mercator: 'Mercator',
  transverseMercator: 'Mercator Transversa',
  azimuthalEquidistant: 'Azimutal Equidistante',
  conicConformal: 'Cónica Conforme',
  conicEqualArea: 'Cónica de Áreas Iguales',
  conicEquidistant: 'Cónica Equidistante',
  albersEqualArea: 'Albers (áreas iguales)',
};
