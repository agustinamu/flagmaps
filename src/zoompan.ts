// Zoom (rueda, centrado en el cursor) y paneo (arrastrar) manipulando el viewBox.
interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Con trazos non-scaling-stroke los microestados (Mónaco, Vaticano) son
// visibles a gran aumento; 400× deja el mapamundi en ~1° de ancho.
const MAX_ZOOM = 400;
// Al enfocar un país no acercar más que 1/100 del mapa: conserva contexto.
const FOCUS_MIN_FRAC = 100;

export interface ZoomPan {
  /** true si el último gesto fue un arrastre: el click posterior debe ignorarse. */
  wasDragged(): boolean;
  reset(): void;
  /** Centra y acerca la vista a un bbox (en unidades del mapa). */
  focus(box: { x: number; y: number; w: number; h: number }): void;
}

export function enableZoomPan(svg: SVGSVGElement): ZoomPan {
  const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '0 0 100 100').split(/\s+/).map(Number);
  const home: ViewBox = { x, y, w, h };
  const vb: ViewBox = { ...home };

  let dragged = false;

  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  const toSvgPoint = (e: { clientX: number; clientY: number }) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: vb.x + ((e.clientX - rect.left) / rect.width) * vb.w,
      y: vb.y + ((e.clientY - rect.top) / rect.height) * vb.h,
    };
  };

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newW = Math.min(home.w, Math.max(home.w / MAX_ZOOM, vb.w * factor));
      const scale = newW / vb.w;
      const p = toSvgPoint(e);
      vb.x = p.x - (p.x - vb.x) * scale;
      vb.y = p.y - (p.y - vb.y) * scale;
      vb.w = newW;
      vb.h *= scale;
      apply();
    },
    { passive: false },
  );

  let start: { clientX: number; clientY: number; vbX: number; vbY: number } | null = null;

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { clientX: e.clientX, clientY: e.clientY, vbX: vb.x, vbY: vb.y };
    dragged = false;
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.clientX;
    const dy = e.clientY - start.clientY;
    if (!dragged && Math.hypot(dx, dy) < 4) return;
    dragged = true;
    const rect = svg.getBoundingClientRect();
    vb.x = start.vbX - (dx / rect.width) * vb.w;
    vb.y = start.vbY - (dy / rect.height) * vb.h;
    apply();
  });

  const end = () => {
    start = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  return {
    wasDragged: () => dragged,
    reset: () => {
      Object.assign(vb, home);
      apply();
    },
    focus: (box) => {
      const aspect = home.w / home.h;
      const w = Math.min(
        home.w,
        Math.max(box.w * 3, box.h * 3 * aspect, home.w / FOCUS_MIN_FRAC),
      );
      const h = w / aspect;
      vb.x = box.x + box.w / 2 - w / 2;
      vb.y = box.y + box.h / 2 - h / 2;
      vb.w = w;
      vb.h = h;
      apply();
    },
  };
}
