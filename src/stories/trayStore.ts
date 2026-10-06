import { useSyncExternalStore } from 'react';
import { fetchStoryGroups } from '../data/storiesRepository';
import { StoryGroup } from '../domain/stories';
import { isSeen, loadSeen, pruneSeen } from './seenStore';

/**
 * Bandeja de historias en memoria. El visor (otra pantalla) lee de aquí el orden de las personas
 * para pasar de una a la siguiente sin volver a consultar al servidor.
 * Orden: la mía primero, luego las que tienen historias SIN ver, luego las vistas; dentro de cada
 * grupo, la más reciente primero. Se calcula al refrescar (no cambia mientras estás viendo).
 */
let groups: StoryGroup[] = [];
const listeners = new Set<() => void>();

export const getTrayGroups = () => groups;

export async function refreshTray(myId: string) {
  try {
    await loadSeen(myId);
    const raw = await fetchStoryGroups();
    pruneSeen(new Set(raw.flatMap((g) => g.stories.map((s) => s.id))));

    const unseen = (g: StoryGroup) => g.stories.some((s) => !isSeen(s.id));
    const latest = (g: StoryGroup) => new Date(g.stories[g.stories.length - 1].createdAt).getTime();
    groups = [...raw].sort((a, b) => {
      if (a.author.id === myId) return -1;
      if (b.author.id === myId) return 1;
      if (unseen(a) !== unseen(b)) return unseen(a) ? -1 : 1;
      return latest(b) - latest(a);
    });
    listeners.forEach((l) => l());
  } catch (e) {
    console.warn('story tray error', e); // sin conexión: se conserva la última bandeja
  }
}

export function clearTray() {
  groups = [];
  listeners.forEach((l) => l());
}

export function useTray(): StoryGroup[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => groups
  );
}