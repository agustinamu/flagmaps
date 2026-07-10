// Menú contextual (clic derecho) y avisos efímeros (toast). Genéricos y
// mínimos: el mapa los usa para las acciones de bandera sin depender del
// tooltip flotante, imposible de alcanzar con el ratón.

export interface MenuItem {
  label: string;
  run: () => void;
}

let openMenu: HTMLElement | null = null;
let onKey: ((e: KeyboardEvent) => void) | null = null;

function closeMenu(): void {
  openMenu?.remove();
  openMenu = null;
  if (onKey) {
    document.removeEventListener('keydown', onKey);
    onKey = null;
  }
}

export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      closeMenu();
      item.run();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  openMenu = menu;

  // Posicionar pegado al cursor sin salirse de la ventana.
  const pad = 6;
  const r = menu.getBoundingClientRect();
  const left = Math.min(x, innerWidth - r.width - pad);
  const top = Math.min(y, innerHeight - r.height - pad);
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;

  // Cerrar al interactuar fuera. pointerdown (captura) cubre clic y arrastre;
  // el menú vive un tick para que su propio clic no lo cierre antes de tiempo.
  const onAway = (e: Event) => {
    if (!menu.contains(e.target as Node)) closeMenu();
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMenu();
  };
  onKey = handleKey;
  setTimeout(() => {
    document.addEventListener('pointerdown', onAway, { capture: true, once: true });
    window.addEventListener('scroll', closeMenu, { once: true, capture: true });
    document.addEventListener('keydown', handleKey);
  });
}

// Se crea al cargar el módulo (no perezosamente) para que la live region ya
// exista en el árbol de accesibilidad antes del primer cambio de texto.
const toastEl = document.createElement('div');
toastEl.className = 'toast';
toastEl.setAttribute('role', 'status');
document.body.appendChild(toastEl);
let toastTimer = 0;

export function toast(message: string, kind: 'ok' | 'bad' = 'ok'): void {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
}
