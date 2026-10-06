import { useSyncExternalStore } from 'react';

/**
 * Registro de celdas visibles. La lista (FlatList) publica aquí qué ids están en pantalla
 * y cada <CachedImage> se suscribe a SU id. Cuando una celda sale del viewport, su imagen
 * pasa a "no activa" y cancela la descarga; así el scroll rápido no acumula trabajo inútil.
 */
let visible = new Set<string>();
const listeners = new Set<() => void>();

export function setVisibleIds(ids: string[]) {
  const next = new Set(ids);
  if (next.size === visible.size && ids.every((i) => visible.has(i))) return; // sin cambios
  visible = next;
  listeners.forEach((l) => l());
}

export function useIsVisible(id: string): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => visible.has(id)
  );
}