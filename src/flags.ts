// Relleno de países con su bandera. Las piezas (islas, exclaves) se agrupan
// por cercanía en clústeres: cada clúster recibe UNA bandera continua ajustada
// a su bbox, así un archipiélago no se fragmenta en decenas de banderitas y
// los territorios lejanos (Canarias, Alaska…) conservan bandera propia.
// La imagen se define una vez por país (<image> en defs como data URL, para
// export autocontenido) y cada pattern la referencia con <use> escalado.
import type { CountryEl } from './geo';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Distorsión máxima permitida al estirar la bandera al bbox de un clúster.
const MAX_STRETCH = 1.8;
// Tamaño mínimo (en unidades del mapa) del tile de un pattern.
const MIN_TILE = 1;
// Separación máxima entre piezas de un mismo clúster, como fracción de la
// diagonal del mapa (~500 km en el mapamundi): por debajo comparten bandera.
export const CLUSTER_GAP = 0.012;

interface FlagAsset {
  href: string; // data URL
  w: number; // tamaño intrínseco del SVG de la bandera
  h: number;
}

const assetCache = new Map<string, Promise<FlagAsset>>();

export function flagUrl(iso: string): string {
  return `flags/${iso}.svg`;
}

// Devuelve un tamaño normalizado (alto = 100) con la proporción real de la
// bandera. Solo importa la proporción, y tamaños intrínsecos enormes
// (Marruecos declara 90000×60000) rompen librsvg al abrir el SVG exportado.
export function parseSize(svgText: string): { w: number; h: number } {
  let w = 3;
  let h = 2; // proporción de bandera más habitual
  const vb = svgText.match(/viewBox="([\d.\s+-]+)"/);
  const wm = svgText.match(/width="([\d.]+)/);
  const hm = svgText.match(/height="([\d.]+)/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) [w, h] = [p[2], p[3]];
  } else if (wm && hm && +wm[1] > 0 && +hm[1] > 0) {
    [w, h] = [+wm[1], +hm[1]];
  }
  return { w: (w / h) * 100, h: 100 };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 0x8000; // String.fromCharCode con arrays enormes revienta la pila
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function flagAsset(iso: string): Promise<FlagAsset> {
  let cached = assetCache.get(iso);
  if (!cached) {
    cached = fetch(flagUrl(iso))
      .then((r) => {
        if (!r.ok) throw new Error(`Bandera no encontrada: ${iso}`);
        return r.text();
      })
      .then((text) => ({
        href: `data:image/svg+xml;base64,${toBase64(text)}`,
        ...parseSize(text),
      }));
    // No cachear fallos: un corte de red no debe dejar la bandera inutilizable.
    cached.catch(() => assetCache.delete(iso));
    assetCache.set(iso, cached);
  }
  return cached;
}

function flagDefs(svg: SVGSVGElement): SVGDefsElement {
  let defs = svg.querySelector<SVGDefsElement>('#flag-defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    defs.id = 'flag-defs';
    svg.prepend(defs);
  }
  return defs;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cluster {
  box: Box;
  pieces: SVGPathElement[];
}

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

function boxUnion(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// Agrupa piezas cuyos bbox estén a menos de maxGap; fusión iterativa para
// que las cadenas isla→isla→continente acaben en el mismo clúster.
export function clusterPieces(pieces: SVGPathElement[], maxGap: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (const piece of pieces) {
    const b = piece.getBBox();
    if (!b.width && !b.height) continue;
    clusters.push({ box: { x: b.x, y: b.y, w: b.width, h: b.height }, pieces: [piece] });
  }
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = clusters.length - 1; j > i; j--) {
        if (boxGap(clusters[i].box, clusters[j].box) <= maxGap) {
          clusters[i].box = boxUnion(clusters[i].box, clusters[j].box);
          clusters[i].pieces.push(...clusters[j].pieces);
          clusters.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return clusters;
}

export function mapDiagonal(svg: SVGSVGElement): number {
  const vb = (svg.dataset.homeViewbox || svg.getAttribute('viewBox') || '0 0 960 540')
    .split(/\s+/)
    .map(Number);
  return Math.hypot(vb[2], vb[3]);
}

export async function applyFlag(svg: SVGSVGElement, c: CountryEl): Promise<void> {
  const asset = await flagAsset(c.iso);
  const defs = flagDefs(svg);

  const imgId = `flagsrc-${c.iso}`;
  if (!defs.querySelector(`[id="${imgId}"]`)) {
    const image = document.createElementNS(SVG_NS, 'image');
    image.id = imgId;
    image.setAttribute('href', asset.href);
    image.setAttribute('width', String(asset.w));
    image.setAttribute('height', String(asset.h));
    defs.appendChild(image);
  }

  const clusters = clusterPieces(c.pieces, mapDiagonal(svg) * CLUSTER_GAP);
  clusters.forEach((cluster, idx) => {
    // Tamaño mínimo de tile: los patterns subpíxel (islotes diminutos) rompen
    // el render de librsvg (InvalidSize) al abrir el SVG exportado.
    const raw = cluster.box;
    const b = {
      w: Math.max(raw.w, MIN_TILE),
      h: Math.max(raw.h, MIN_TILE),
      x: raw.x - (Math.max(raw.w, MIN_TILE) - raw.w) / 2,
      y: raw.y - (Math.max(raw.h, MIN_TILE) - raw.h) / 2,
    };
    const patternId = `flag-${c.iso}-${idx}`;
    defs.querySelector(`[id="${patternId}"]`)?.remove();

    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.id = patternId;
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('x', String(b.x));
    pattern.setAttribute('y', String(b.y));
    pattern.setAttribute('width', String(b.w));
    pattern.setAttribute('height', String(b.h));

    // La bandera se estira para llenar el bbox del clúster, pero con la
    // distorsión limitada a MAX_STRETCH: a partir de ahí se recorta (cover).
    // Así Chad (alto y estrecho) enseña sus tres franjas verticales sin
    // deformar en exceso banderas con escudo.
    const sx = b.w / asset.w;
    const sy = b.h / asset.h;
    let sx2 = sx;
    let sy2 = sy;
    const dist = sy / sx;
    if (dist > MAX_STRETCH) sx2 = sy / MAX_STRETCH;
    else if (dist < 1 / MAX_STRETCH) sy2 = sx / MAX_STRETCH;
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${imgId}`);
    const tx = (b.w - asset.w * sx2) / 2;
    const ty = (b.h - asset.h * sy2) / 2;
    use.setAttribute('transform', `translate(${tx} ${ty}) scale(${sx2} ${sy2})`);
    pattern.appendChild(use);
    defs.appendChild(pattern);

    for (const piece of cluster.pieces) piece.style.fill = `url(#${patternId})`;
  });

  c.el.classList.add('has-flag');
}

export function removeFlag(svg: SVGSVGElement, c: CountryEl): void {
  const defs = svg.querySelector('#flag-defs');
  defs
    ?.querySelectorAll(`[id^="flag-${c.iso}-"], [id="flagsrc-${c.iso}"]`)
    .forEach((el) => el.remove());
  for (const piece of c.pieces) piece.style.fill = '';
  c.el.classList.remove('has-flag');
}
