// Persistencia de la selección en localStorage, una clave por mapa.
const key = (mapId: string) => `flagmap:${mapId}`;

export function loadSelection(mapId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(mapId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSelection(mapId: string, selection: Set<string>): void {
  localStorage.setItem(key(mapId), JSON.stringify([...selection]));
}
