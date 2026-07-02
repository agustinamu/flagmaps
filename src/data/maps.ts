// Mapas disponibles: misma fuente de verdad que el pipeline de build
// (data/maps.config.json). Añadir un mapa = una entrada allí + npm run build:maps.
import config from '../../data/maps.config.json';

export interface ProjectionDef {
  type: 'equalEarth' | 'conicConformal';
  rotate?: [number, number];
  parallels?: [number, number];
}

export interface MapDef {
  id: string;
  name: string;
  projection: ProjectionDef;
}

interface RawMapConfig {
  name: string;
  projection: ProjectionDef;
}

export const MAPS: MapDef[] = Object.entries(config as unknown as Record<string, RawMapConfig>).map(
  ([id, def]) => ({ id, name: def.name, projection: def.projection }),
);
