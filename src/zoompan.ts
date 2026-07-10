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
// Holgura click-vs-arrastre: un clic humano tiene jitter de varios px entre
// pulsar y soltar. Con 4px un clic normal se tomaba por paneo y anulaba el
// toggle de bandera (solo quedaba el tooltip). 8px separa clic de paneo real.
const DRAG_SLOP_PX = 8;

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

  // Escala el viewBox por factor manteniendo fijo el punto p (en unidades del mapa).
  const zoomAt = (p: { x: number; y: number }, factor: number) => {
    const newW = Math.min(home.w, Math.max(home.w / MAX_ZOOM, vb.w * factor));
    const scale = newW / vb.w;
    vb.x = p.x - (p.x - vb.x) * scale;
    vb.y = p.y - (p.y - vb.y) * scale;
    vb.w = newW;
    vb.h *= scale;
    apply();
  };

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(toSvgPoint(e), e.deltaY > 0 ? 1.25 : 0.8);
    },
    { passive: false },
  );

  let start: { clientX: number; clientY: number; vbX: number; vbY: number } | null = null;
  // Punteros activos sobre el mapa: con dos, el gesto es pinza (zoom táctil).
  const pointers = new Map<number, { clientX: number; clientY: number }>();
  let pinch: { dist: number; mid: { clientX: number; clientY: number } } | null = null;

  // Paneo con listeners en window (no setPointerCapture): capturar el puntero
  // en el <svg> redirige el pointerup/click al propio <svg>, con lo que el
  // click perdía el país (target = <svg>) y el toggle de bandera no disparaba
  // nunca con ratón real. En window seguimos el arrastre aunque el cursor
  // salga del mapa, y el <svg> conserva el país como target del click.
  const onMove = (e: PointerEvent) => {
    const tracked = pointers.get(e.pointerId);
    if (tracked) {
      tracked.clientX = e.clientX;
      tracked.clientY = e.clientY;
    }
    if (pointers.size >= 2) {
      dragged = true; // el tap que cierra una pinza no debe togglear bandera
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mid = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
      if (pinch) {
        // Paneo con el desplazamiento del punto medio…
        const rect = svg.getBoundingClientRect();
        vb.x -= ((mid.clientX - pinch.mid.clientX) / rect.width) * vb.w;
        vb.y -= ((mid.clientY - pinch.mid.clientY) / rect.height) * vb.h;
        // …y zoom según el cambio de distancia entre dedos (misma matemática que la rueda).
        if (dist && pinch.dist) zoomAt(toSvgPoint(mid), pinch.dist / dist);
        else apply();
      }
      pinch = { dist, mid };
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.clientX;
    const dy = e.clientY - start.clientY;
    if (!dragged && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    dragged = true;
    const rect = svg.getBoundingClientRect();
    vb.x = start.vbX - (dx / rect.width) * vb.w;
    vb.y = start.vbY - (dy / rect.height) * vb.h;
    apply();
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = null;
    if (pointers.size === 1) {
      // Al soltar un dedo de la pinza, el que queda continúa el paneo sin salto.
      const [p] = [...pointers.values()];
      start = { clientX: p.clientX, clientY: p.clientY, vbX: vb.x, vbY: vb.y };
      return;
    }
    if (pointers.size) return;
    start = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (pointers.size >= 2) {
      // Segundo dedo: cancelar el paneo de uno; la pinza arranca en el primer move.
      start = null;
      pinch = null;
    } else {
      start = { clientX: e.clientX, clientY: e.clientY, vbX: vb.x, vbY: vb.y };
      dragged = false;
    }
    // Registrar dos veces el mismo handler es inocuo (addEventListener deduplica).
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

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
