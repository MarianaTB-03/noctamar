import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { addComment, deleteComment } from '../data/commentsRepository';
import { sendMessage } from '../data/messagesRepository';
import { setLike } from '../data/postsRepository';
import { supabase } from '../data/supabase';
import {
    ActionType, bumpAttempts, countPending,
    OutboxRow,
    peekOldest, removeRow,
    setOutboxListener,
} from './outbox';

/**
 * MOTOR DE SINCRONIZACIÓN
 *
 *  - Procesa la cola en orden estricto (seq ascendente), de UNA en UNA.
 *  - Si falla por RED: se detiene (no se salta la acción, para no alterar el orden) y reintenta
 *    cuando vuelva la conexión o tras un backoff exponencial.
 *  - Si falla por una razón PERMANENTE (el post ya no existe, no hay permiso...): la acción se
 *    descarta y se avisa a la UI para que revierta el cambio optimista. Una acción mala no
 *    bloquea las demás.
 *  - Es idempotente: reintentar una acción ya aplicada no daña nada (upsert en likes, id de
 *    comentario generado en el cliente, duplicado = éxito, borrar algo ya borrado = éxito).
 */

export interface SyncResult {
  type: ActionType;
  entityId: string;
  payload: any;
  status: 'done' | 'failed';
  reason?: string;
}

const MAX_ATTEMPTS = 6;

// ---------- Estado observable por la UI ----------
interface SyncState { online: boolean; pending: number; syncing: boolean }
let state: SyncState = { online: true, pending: 0, syncing: false };
const stateListeners = new Set<() => void>();
const resultListeners = new Set<(r: SyncResult) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }; // objeto nuevo => React detecta el cambio
  stateListeners.forEach((l) => l());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => { stateListeners.add(cb); return () => { stateListeners.delete(cb); }; },
    () => state
  );
}

export function onSyncResult(fn: (r: SyncResult) => void): () => void {
  resultListeners.add(fn);
  return () => { resultListeners.delete(fn); };
}

// ---------- Internos ----------
let running = false;
let inFlightSeq: number | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export const isInFlight = (seq: number) => inFlightSeq === seq;

async function currentUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function refreshPending() {
  const uid = await currentUid();
  setState({ pending: uid ? await countPending(uid) : 0 });
}

function isNetworkError(e: any): boolean {
  const msg = String(e?.message ?? e).toLowerCase();
  return /network|fetch|timeout|timed out|offline|failed to connect|internet/.test(msg);
}

/** Errores que reintentar NO arregla (regla de seguridad, llave foránea, dato inválido...). */
function isPermanent(e: any): boolean {
  const code = String(e?.code ?? '');
  return code.startsWith('23') || code.startsWith('42') || code.startsWith('22') || code.startsWith('PGRST');
}

async function execute(row: OutboxRow) {
  const p = JSON.parse(row.payload);
  switch (row.type) {
    case 'like':
      return setLike(p.postId, p.liked);
    case 'comment_add':
      try {
        return await addComment({ ...p, userId: row.user_id });
      } catch (e: any) {
        if (e?.code === '23505') return; // ya estaba insertado: un reintento anterior sí llegó
        throw e;
      }
    case 'comment_delete':
      return deleteComment(p.id); // borrar algo ya borrado no es error
    case 'message_send':
      try {
        return await sendMessage({ ...p, senderId: row.user_id });
      } catch (e: any) {
        if (e?.code === '23505') return; // el mensaje ya había llegado en un intento anterior
        throw e;
      }
  }
}

function emit(row: OutboxRow, status: 'done' | 'failed', reason?: string) {
  const r: SyncResult = { type: row.type, entityId: row.entity_id, payload: JSON.parse(row.payload), status, reason };
  resultListeners.forEach((l) => l(r));
}

function scheduleRetry(attempts: number) {
  if (retryTimer) clearTimeout(retryTimer);
  const delay = Math.min(30000, 1500 * 2 ** Math.min(attempts, 5)); // 1.5s, 3s, 6s ... tope 30s
  retryTimer = setTimeout(() => { retryTimer = null; kick(); }, delay);
}

/** Procesa la cola mientras haya conexión y acciones. Seguro de llamar muchas veces. */
export async function kick() {
  if (running || !state.online) return;
  const uid = await currentUid();
  if (!uid) return;

  running = true;
  setState({ syncing: true });
  try {
    for (;;) {
      const row = await peekOldest(uid);
      if (!row) break;
      inFlightSeq = row.seq;
      try {
        await execute(row);
        await removeRow(row.seq);
        emit(row, 'done');
      } catch (e: any) {
        if (isPermanent(e)) {
          await removeRow(row.seq); // se descarta; las siguientes acciones continúan
          emit(row, 'failed', e?.message);
        } else {
          const attempts = await bumpAttempts(row.seq);
          if (!isNetworkError(e) && attempts >= MAX_ATTEMPTS) {
            await removeRow(row.seq);
            emit(row, 'failed', e?.message);
          } else {
            scheduleRetry(attempts); // se conserva en la cola, en su mismo lugar
            break;
          }
        }
      } finally {
        inFlightSeq = null;
        await refreshPending();
      }
    }
  } finally {
    running = false;
    setState({ syncing: false });
    refreshPending();
  }
}

/** Se llama una vez al iniciar sesión: escucha conectividad y vuelta a primer plano. */
export function startSync() {
  if (started) { kick(); return; }
  started = true;
  setOutboxListener(() => { refreshPending(); });

  NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    const wasOnline = state.online;
    setState({ online });
    if (online && !wasOnline) kick(); // volvió internet: se vacía la cola en orden
  });
  AppState.addEventListener('change', (st) => { if (st === 'active') kick(); });

  NetInfo.fetch().then((s) => {
    setState({ online: !!s.isConnected && s.isInternetReachable !== false });
    refreshPending();
    kick();
  });
}