# Flagmaps · Atlas de Banderas

Mapa interactivo para pintar países con su bandera y explorar estadísticas
(superficie, población, densidad). Render SVG generado desde datos crudos de
Natural Earth con d3-geo; sin frameworks.

## Uso

```sh
npm install
npm run dev        # desarrollo
npm run build      # producción (dist/)
```

## Pipeline de datos

Los datos generados viven en `public/` y se regeneran con:

| Script | Genera | Fuente |
|---|---|---|
| `npm run build:maps` | `public/data/<mapa>.json` (TopoJSON) | Natural Earth 50m (caché en `data/cache/`) |
| `npm run build:flags` | `public/flags/*.svg` | flagcdn.com |
| `npm run build:stats` | `public/data/stats.json` | Banco Mundial (`SP.POP.TOTL`, `AG.SRF.TOTL.K2`); respaldo Natural Earth para territorios sin dato (Taiwán, Sáhara Occidental…) |

Añadir un mapa = una entrada en `data/maps.config.json` + `npm run build:maps`.

## Módulos (`src/`)

- `geo.ts` — TopoJSON → SVG con d3-geo; una pieza (`<path>`) por polígono.
- `flags.ts` — relleno con banderas; las piezas cercanas se agrupan en
  clústeres que comparten una bandera continua (archipiélagos), los territorios
  lejanos (Canarias, Alaska…) reciben bandera propia.
- `stats.ts` — carga y formato de estadísticas por país (con año/fuente del dato).
- `choropleth.ts` — coloreado por métrica (7 clases por cuantiles) + leyenda.
- `ranking.ts` — lista de países ordenada por la métrica activa (clic = localizar).
- `compare.ts` — tira horizontal de siluetas escaladas por √valor (comparación visual).
- `zoompan.ts` — zoom con rueda, paneo y foco a un bbox; trazos non-scaling-stroke.
- `exporter.ts` — export SVG/PNG en versión clara para impresión.
- `state.ts` — persistencia de la selección en localStorage.
- `main.ts` — orquestación de la UI y los modos de vista.

## Notas

- Los modos de datos no tocan los rellenos de bandera: el choropleth colorea el
  `<g>` del país y el CSS de `.data-mode` fuerza la herencia en las piezas.
- El export respeta el modo activo (banderas o choropleth).
