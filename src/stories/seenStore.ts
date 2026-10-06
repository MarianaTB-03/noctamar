import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Estado "visto" de las historias, PERSISTIDO EN EL DISPOSITIVO (AsyncStorage), por usuario.
 * Es solo local: no se sube al servidor, así que el autor no sabe quién la vio.
 * Se podan los ids de historias que ya vencieron para que el almacenamiento no crezca sin fin.
 */
let seen = new Set<string>();
let loadedFor: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const keyOf = (uid: string) => `@noctamar/seen-stories/${uid}`;

function notify() { version++; listeners.forEach((l) => l()); }
function persist() {
  if (!loadedFor) return;
  AsyncStorage.setItem(keyOf(loadedFor), JSON.stringify([...seen])).catch(() => {});
}

export async function loadSeen(uid: string) {
  if (loadedFor === uid) return;
  try {
    const raw = await AsyncStorage.getItem(keyOf(uid));
    seen = new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    seen = new Set();
  }
  loadedFor = uid;
  notify();
}

export const isSeen = (id: string) => seen.has(id);

export function markSeen(id: string) {
  if (seen.has(id)) return;
  seen.add(id);
  persist();
  notify();
}

export function pruneSeen(activeIds: Set<string>) {
  let changed = false;
  seen.forEach((id) => { if (!activeIds.has(id)) { seen.delete(id); changed = true; } });
  if (changed) persist();
}

/** Cambia cada vez que se marca algo como visto: sirve para que la UI se vuelva a pintar. */
export function useSeenVersion(): number {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => version
  );
}