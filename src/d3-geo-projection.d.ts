// d3-geo-projection no publica tipos propios ni hay @types/d3-geo-projection.
// Se declara aquí solo lo que se usa (geoMollweide).
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';

  export function geoMollweide(): GeoProjection;
}
