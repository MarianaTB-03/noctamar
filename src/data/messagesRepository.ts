import { ChatMessage, InboxItem } from '../domain/messages';
import { supabase } from './supabase';

const COLUMNS = 'id, conversation_id, sender_id, body, created_at, delivered_at, read_at';

export function toMessage(r: any): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at ?? null,
    readAt: r.read_at ?? null,
  };
}

export async function fetchInbox(): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc('my_inbox');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    conversationId: r.conversation_id,
    lastMessageAt: r.last_message_at,
    other: { id: r.other_id, username: r.username, full_name: r.full_name, avatar_url: r.avatar_url },
    lastBody: r.last_body,
    lastSender: r.last_sender,
    unread: Number(r.unread_count ?? 0),
  }));
}

/** Abre (o crea, de forma atómica en el servidor) el chat 1 a 1 con otra persona. */
export async function startConversation(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_dm', { other: otherId });
  if (error) throw error;
  return data as string;
}

/** Mensajes más recientes primero, paginados por cursor (created_at). */
export async function fetchMessages(conversationId: string, before?: string, limit = 30): Promise<ChatMessage[]> {
  let q = supabase
    .from('messages').select(COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toMessage);
}

export async function sendMessage(m: { id: string; conversationId: string; senderId: string; body: string }) {
  const { error } = await supabase.from('messages').insert({
    id: m.id, conversation_id: m.conversationId, sender_id: m.senderId, body: m.body,
  });
  if (error) throw error;
}

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_read', { conv: conversationId });
  if (error) throw error;
}

export async function markAllDelivered() {
  const { error } = await supabase.rpc('mark_all_delivered');
  if (error) throw error;
}

interface ChatHandlers {
  onInsert: (m: ChatMessage) => void;
  onUpdate: (m: ChatMessage) => void;
  onTyping: (typing: boolean) => void;
}

/**
 * UN canal Realtime por conversación con dos tipos de eventos:
 *  - postgres_changes: mensajes nuevos y cambios de entregado/visto (vienen de la base de datos,
 *    y Supabase les aplica RLS: solo llegan los de conversaciones donde soy miembro).
 *  - broadcast "typing": efímero, NO se guarda en la base de datos (mucho más barato).
 */
export function subscribeToChat(conversationId: string, myId: string, h: ChatHandlers) {
  let ready = false;
  const channel = supabase
    .channel(`chat:${conversationId}`, { config: { broadcast: { self: false } } })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => h.onInsert(toMessage(p.new))
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => h.onUpdate(toMessage(p.new))
    )
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.userId !== myId) h.onTyping(!!payload?.typing);
    })
    .subscribe((status) => { ready = status === 'SUBSCRIBED'; });

  return {
    sendTyping(typing: boolean) {
      if (!ready) return;
      channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, typing } });
    },
    unsubscribe() { supabase.removeChannel(channel); }, // sin esto el canal queda abierto (fuga)
  };
}