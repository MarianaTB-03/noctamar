import { useSyncExternalStore } from 'react';
import { fetchInbox, markAllDelivered } from '../data/messagesRepository';
import { supabase } from '../data/supabase';

/**
 * Escucha GLOBAL de mensajería (mientras hay sesión):
 *  - cuando llega un mensaje de otra persona, este dispositivo lo marca como ENTREGADO
 *    aunque no tenga el chat abierto (así el emisor ve "Entregado");
 *  - avisa a la bandeja para que se reordene y actualiza el contador de no leídos.
 */
let channel: ReturnType<typeof supabase.channel> | null = null;
let currentUid: string | null = null;
let unread = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const storeListeners = new Set<() => void>();
const inboxListeners = new Set<() => void>();

async function refreshUnread() {
  try {
    const inbox = await fetchInbox();
    unread = inbox.reduce((n, i) => n + i.unread, 0);
    storeListeners.forEach((l) => l());
  } catch { /* sin conexión: se conserva el último valor */ }
}

function emit() {
  // Debounce: varios eventos seguidos producen una sola actualización
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    inboxListeners.forEach((l) => l());
    refreshUnread();
  }, 250);
}

export function onInboxChange(fn: () => void): () => void {
  inboxListeners.add(fn);
  return () => { inboxListeners.delete(fn); };
}

export function useUnreadMessages(): number {
  return useSyncExternalStore(
    (cb) => { storeListeners.add(cb); return () => { storeListeners.delete(cb); }; },
    () => unread
  );
}

export function startMessaging(uid: string) {
  if (currentUid === uid) return;
  stopMessaging();
  currentUid = uid;

  channel = supabase
    .channel(`inbox:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      if ((p.new as any).sender_id !== uid) markAllDelivered().catch(() => {});
      emit();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => emit())
    .subscribe();

  markAllDelivered().catch(() => {}); // lo que llegó mientras la app estaba cerrada
  refreshUnread();
}

export function stopMessaging() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  currentUid = null;
  unread = 0;
  storeListeners.forEach((l) => l());
}