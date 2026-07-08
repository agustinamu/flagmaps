// Acciones sobre la bandera de un país: copiar como PNG (pegable en Canva,
// WhatsApp, Docs…) o descargar el SVG vectorial (para subir a Canva u otros).
// El portapapeles del navegador no admite SVG como imagen; de ahí la división.
import { flagUrl, parseSize } from './flags';

// Alto de rasterizado; el ancho sale de la proporción real de la bandera.
const PNG_HEIGHT = 512;

async function fetchFlagText(iso: string): Promise<string> {
  const res = await fetch(flagUrl(iso));
  if (!res.ok) throw new Error(`Bandera no encontrada: ${iso}`);
  return res.text();
}

// Fuerza width/height en el <svg>: muchas banderas solo traen viewBox y Chrome
// las rasteriza a 0×0 en canvas si no tienen dimensiones intrínsecas.
function withIntrinsicSize(svgText: string, w: number, h: number): string {
  if (/<svg\b[^>]*\bwidth=/.test(svgText)) return svgText;
  return svgText.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
}

export async function copyFlagPng(iso: string): Promise<void> {
  const text = await fetchFlagText(iso);
  const { w, h } = parseSize(text); // h=100, w=proporción·100
  const url = URL.createObjectURL(
    new Blob([withIntrinsicSize(text, w, h)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo rasterizar la bandera'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.height = PNG_HEIGHT;
    canvas.width = Math.round(PNG_HEIGHT * (w / h));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('No se pudo generar el PNG');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadFlagSvg(iso: string, name: string): Promise<void> {
  const text = await fetchFlagText(iso);
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  a.download = `${slug || iso}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}
