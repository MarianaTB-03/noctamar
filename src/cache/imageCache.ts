import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { LRUCache } from './lruCache';

/**
 * CACHÉ DE IMÁGENES PROPIA DE DOS NIVELES
 *
 *   Nivel 1 (RAM)   LRU clave -> URI local del archivo. Respuesta síncrona, sin tocar disco.
 *   Nivel 2 (disco) LRU con límite en BYTES. Archivos en la carpeta de caché + un índice
 *                   persistido en AsyncStorage (sobrevive al reinicio de la app).
 *   Nivel 3 (red)   Descarga con fetch + AbortController, a través de una cola con
 *                   concurrencia limitada.
 *
 * La CLAVE es la ruta del archivo en Storage (p.ej. "uid/postId.jpg"), NO la URL firmada:
 * la URL firmada cambia cada vez que se pide, así que como clave nunca daría aciertos.
 *
 * Solo se entregan URIs locales (file://) al componente <Image>, por lo que ninguna imagen
 * se descarga "sola": todo pasa por este módulo y puede cancelarse.
 */

const RAM_MAX_ENTRIES = 80;
const DISK_MAX_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_CONCURRENT_DOWNLOADS = 4;
const INDEX_KEY = '@noctamar/imagecache/index/v1';

type DiskEntry = { name: string; size: number };

// ---------- Estado ----------
let dir: Directory | null = null;
let initPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const ram = new LRUCache<string>(RAM_MAX_ENTRIES);
const disk = new LRUCache<DiskEntry>(
  DISK_MAX_BYTES,
  (e) => e.size,
  (key, entry) => {
    // Al expulsar del disco, también se borra el archivo y la entrada de RAM
    ram.delete(key);
    try { if (dir) new File(dir, entry.name).delete(); } catch { /* ya no existía */ }
  }
);

export const stats = { ramHits: 0, diskHits: 0, downloads: 0, cancelled: 0, failed: 0 };

// ---------- Inicialización y persistencia del índice ----------
function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      dir = new Directory(Paths.cache, 'noctamar-images');
      if (!dir.exists) dir.create({ intermediates: true });
      try {
        const raw = await AsyncStorage.getItem(INDEX_KEY);
        if (raw) {
          const list: [string, DiskEntry][] = JSON.parse(raw);
          list.forEach(([k, v]) => disk.set(k, v)); // en orden: de más antigua a más reciente
        }
      } catch { /* índice corrupto: se reconstruye solo */ }

      // Barrido de huérfanos: archivos que quedaron en disco sin entrada en el índice
      // (p. ej. la app se cerró antes de guardar el índice). Sin esto superarían el límite en silencio.
      try {
        const known = new Set(disk.entries().map(([, e]) => e.name));
        for (const item of dir.list()) {
          if (item instanceof File && !known.has(item.name)) item.delete();
        }
      } catch { /* */ }
    })();
  }
  return initPromise;
}

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(INDEX_KEY, JSON.stringify(disk.entries())).catch(() => {});
  }, 1500);
}

// Nombre de archivo seguro y SIN colisiones: hash de la clave completa + cola legible
function fileName(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  const tail = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return `${(h >>> 0).toString(36)}_${tail}`;
}

// ---------- Cola de descargas ----------
type Job = {
  key: string;
  url: string;
  subscribers: number;
  controller: AbortController;
  started: boolean;
  promise: Promise<string>;
  resolve: (uri: string) => void;
  reject: (e: unknown) => void;
};

const inflight = new Map<string, Job>(); // deduplicación: una sola descarga por clave
const pending: Job[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT_DOWNLOADS && pending.length > 0) {
    // LIFO: lo último que entró a pantalla es lo que el usuario está viendo ahora
    const job = pending.pop()!;
    if (job.controller.signal.aborted) continue;
    job.started = true;
    active++;
    run(job)
      .then(job.resolve, (e) => {
        if (!job.controller.signal.aborted) stats.failed++; // cancelar no cuenta como fallo
        job.reject(e);
      })
      .finally(() => {
        active--;
        if (inflight.get(job.key) === job) inflight.delete(job.key);
        pump();
      });
  }
}

async function run(job: Job): Promise<string> {
  await init();
  const { key, url, controller } = job;

  // Nivel 2: ¿ya está en disco?
  const onDisk = disk.get(key);
  if (onDisk) {
    const f = new File(dir!, onDisk.name);
    if (f.exists) {
      stats.diskHits++;
      ram.set(key, f.uri);
      return f.uri;
    }
    disk.delete(key); // el índice mentía (el sistema limpió la caché): se corrige
  }

  // Nivel 3: red (cancelable)
  const res = await fetch(url, { signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (controller.signal.aborted) throw new Error('aborted');

  const name = fileName(key);
  const f = new File(dir!, name);
  if (f.exists) f.delete();
  f.create();
  f.write(new Uint8Array(buf));

  stats.downloads++;
  disk.set(key, { name, size: buf.byteLength });
  ram.set(key, f.uri);
  persistSoon();
  return f.uri;
}

// ---------- API pública ----------

/** Búsqueda SÍNCRONA en RAM (sin esperas ni parpadeo). */
export function peek(key: string): string | undefined {
  const hit = ram.get(key);
  if (hit) stats.ramHits++;
  return hit;
}

export interface ImageRequest {
  promise: Promise<string>;
  /** Cancela esta solicitud. Si nadie más espera esa imagen, aborta la descarga de verdad. */
  cancel: () => void;
}

/**
 * Pide una imagen. Si ya hay una descarga en curso para la misma clave, se COMPARTE
 * (conteo de suscriptores); la descarga solo se aborta cuando el último suscriptor cancela.
 */
export function request(key: string, url: string): ImageRequest {
  let job = inflight.get(key);
  if (job && job.controller.signal.aborted) job = undefined; // la anterior ya se canceló: empezar otra
  if (!job) {
    let resolve!: (uri: string) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
    promise.catch(() => {}); // evita "unhandled rejection" cuando se cancela
    job = {
      key, url, subscribers: 0, controller: new AbortController(),
      started: false, promise, resolve, reject,
    };
    inflight.set(key, job);
    pending.push(job);
    pump();
  }
  job.subscribers++;

  const mine = job;
  let cancelled = false;
  return {
    promise: mine.promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      mine.subscribers--;
      if (mine.subscribers > 0) return; // otro componente aún la necesita
      stats.cancelled++;
      mine.controller.abort(); // corta la descarga HTTP en curso
      const i = pending.indexOf(mine);
      if (i >= 0) pending.splice(i, 1); // si seguía en cola, ni siquiera arranca
      if (!mine.started) {
        inflight.delete(mine.key);
        mine.reject(new Error('cancelled'));
      }
    },
  };
}

/** Vacía RAM y disco (útil al cerrar sesión). */
export async function clearImageCache() {
  await init();
  ram.clear();
  disk.entries().forEach(([, e]) => { try { new File(dir!, e.name).delete(); } catch { /* */ } });
  disk.clear();
  await AsyncStorage.removeItem(INDEX_KEY);
}

export function cacheDebugInfo() {
  return { ...stats, ramEntries: ram.size, diskEntries: disk.size, diskMB: +(disk.cost / 1048576).toFixed(2) };
}