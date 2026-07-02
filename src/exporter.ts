// Export del mapa en versión clara apta para impresión:
// SVG vectorial (ideal para imprimir a cualquier tamaño) y PNG en alta resolución.
const PRINT_LAND = '#e9e5dc';
const PRINT_BORDER = '#8b8578';
const PRINT_OCEAN = '#ffffff';
const PNG_SCALE = 5;

function printClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Encuadre completo original, sin el zoom/pan actual.
  const home = svg.dataset.homeViewbox;
  if (home) clone.setAttribute('viewBox', home);
  const [, , w, h] = (clone.getAttribute('viewBox') ?? '0 0 100 100').split(/\s+/).map(Number);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // En el export el trazo vuelve a unidades del mapa: non-scaling-stroke
  // depende del tamaño de render y haría fronteras imprevisibles al rasterizar.
  for (const el of clone.querySelectorAll('[vector-effect]')) el.removeAttribute('vector-effect');

  // El CSS de la página no viaja con el SVG: fijar estilos como atributos.
  const dataMode = svg.classList.contains('data-mode');
  for (const el of clone.querySelectorAll<SVGGraphicsElement>('.country, .land')) {
    if (dataMode) {
      // Export del choropleth: color de clase en el grupo, sin banderas debajo.
      const color = el.style.fill;
      for (const piece of el.querySelectorAll('path')) piece.style.fill = '';
      el.style.fill = '';
      el.setAttribute('fill', color || PRINT_LAND);
    } else if (!el.classList.contains('has-flag')) {
      el.setAttribute('fill', PRINT_LAND);
    }
    el.setAttribute('stroke', PRINT_BORDER);
    el.setAttribute('stroke-width', '0.3');
  }
  clone.querySelector('.sphere')?.setAttribute('fill', PRINT_OCEAN);
  const ns = 'http://www.w3.org/2000/svg';
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', PRINT_OCEAN);
  clone.prepend(bg);
  return clone;
}

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function serialize(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

export function exportSVG(svg: SVGSVGElement, name: string): void {
  const text = serialize(printClone(svg));
  download(new Blob([text], { type: 'image/svg+xml' }), `flagmap-${name}.svg`);
}

export async function exportPNG(svg: SVGSVGElement, name: string): Promise<void> {
  const clone = printClone(svg);
  const w = Number(clone.getAttribute('width'));
  const h = Number(clone.getAttribute('height'));

  const url = URL.createObjectURL(new Blob([serialize(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo rasterizar el SVG'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * PNG_SCALE);
    canvas.height = Math.round(h * PNG_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = PRINT_OCEAN;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar el PNG');
    download(blob, `flagmap-${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
