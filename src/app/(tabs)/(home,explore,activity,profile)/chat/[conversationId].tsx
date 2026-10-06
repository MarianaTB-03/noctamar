import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../../constants/brand';
import {
    fetchMessages, markRead, subscribeToChat,
} from '../../../../data/messagesRepository';
import { ChatMessage } from '../../../../domain/messages';
import { useAuth } from '../../../../presentation/AuthProvider';
import { Avatar } from '../../../../presentation/Avatar';
import { useKeyboardHeight } from '../../../../presentation/useKeyboardHeight';
import { enqueueMessage, pendingMessages } from '../../../../sync/outbox';
import { kick, onSyncResult } from '../../../../sync/syncEngine';

const TYPING_REPEAT_MS = 2000; // cada cuánto se repite "escribiendo" mientras sigues tecleando
const TYPING_IDLE_MS = 2500;   // sin teclear este tiempo => "dejó de escribir"
const TYPING_EXPIRE_MS = 4500; // si no llega aviso, el indicador se apaga solo

function clock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { conversationId, otherId, name, avatar } = useLocalSearchParams<{
    conversationId: string; otherId: string; name: string; avatar: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';

  // Teclado (Android): mismo método medido que en comentarios
  const keyboard = useKeyboardHeight();
  const rootRef = useRef<View>(null);
  const [spaceBelow, setSpaceBelow] = useState(0);
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      setSpaceBelow(Math.max(0, Dimensions.get('window').height - (y + h)));
    });
  }, []);
  const lift = Math.max(0, keyboard - spaceBelow);

  // Más reciente primero: la lista va invertida (lo nuevo queda abajo)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const loadingMore = useRef(false);
  const endReached = useRef(false);

  const channel = useRef<ReturnType<typeof subscribeToChat> | null>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carga inicial + canal Realtime
  useEffect(() => {
    if (!conversationId || !uid) return;
    let alive = true;

    (async () => {
      try {
        const [list, queued] = await Promise.all([
          fetchMessages(conversationId).catch(() => [] as ChatMessage[]),
          pendingMessages(uid, conversationId),
        ]);
        if (!alive) return;
        const known = new Set(list.map((m) => m.id));
        const pending: ChatMessage[] = queued
          .filter((q) => !known.has(q.id))
          .map((q) => ({
            id: q.id, conversationId, senderId: uid, body: q.body,
            createdAt: new Date().toISOString(), deliveredAt: null, readAt: null, pending: true,
          }))
          .reverse();
        endReached.current = list.length < 30;
        setMessages([...pending, ...list]);
        markRead(conversationId).catch(() => {}); // abrí el chat: lo recibido pasa a "visto"
      } finally {
        if (alive) setLoading(false);
      }
    })();

    channel.current = subscribeToChat(conversationId, uid, {
      onInsert: (m) => {
        setMessages((prev) => {
          const i = prev.findIndex((x) => x.id === m.id);
          if (i >= 0) { // eco de MI mensaje: confirma el optimista, no lo duplica
            const copy = [...prev];
            copy[i] = { ...m, pending: false };
            return copy;
          }
          return [m, ...prev];
        });
        if (m.senderId !== uid) {
          setOtherTyping(false);
          markRead(conversationId).catch(() => {}); // estoy viendo el chat: se marca visto al instante
        }
      },
      onUpdate: (m) =>
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m, pending: false } : x))),
      onTyping: (typing) => {
        setOtherTyping(typing);
        if (expireTimer.current) clearTimeout(expireTimer.current);
        if (typing) expireTimer.current = setTimeout(() => setOtherTyping(false), TYPING_EXPIRE_MS);
      },
    });

    return () => {
      alive = false;
      channel.current?.sendTyping(false);
      channel.current?.unsubscribe();
      channel.current = null;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (expireTimer.current) clearTimeout(expireTimer.current);
    };
  }, [conversationId, uid]);

  // Resultado de la cola: confirma el envío o avisa si el servidor lo rechazó
  useEffect(() => {
    return onSyncResult((r) => {
      if (r.type !== 'message_send' || r.payload.conversationId !== conversationId) return;
      if (r.status === 'done') {
        setMessages((prev) => prev.map((m) => (m.id === r.entityId ? { ...m, pending: false } : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== r.entityId));
        Alert.alert('No se pudo enviar el mensaje', 'El servidor lo rechazó.');
      }
    });
  }, [conversationId]);

  async function loadOlder() {
    if (loadingMore.current || endReached.current || messages.length === 0) return;
    loadingMore.current = true;
    try {
      const oldest = [...messages].reverse().find((m) => !m.pending);
      if (!oldest) return;
      const older = await fetchMessages(conversationId, oldest.createdAt);
      endReached.current = older.length < 30;
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...prev, ...older.filter((m) => !have.has(m.id))];
      });
    } catch (e) {
      console.warn('older messages error', e);
    } finally {
      loadingMore.current = false;
    }
  }

  /** "Escribiendo…": aviso efímero por Broadcast, limitado a uno cada 2 s mientras tecleas. */
  function onChangeText(value: string) {
    setText(value);
    const now = Date.now();
    if (value.length > 0 && now - lastTypingSent.current > TYPING_REPEAT_MS) {
      lastTypingSent.current = now;
      channel.current?.sendTyping(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      lastTypingSent.current = 0;
      channel.current?.sendTyping(false);
    }, TYPING_IDLE_MS);
  }

  async function send() {
    const body = text.trim();
    if (!body || !conversationId || !uid) return;
    const id = Crypto.randomUUID(); // id del cliente => reintentos sin duplicados
    const optimistic: ChatMessage = {
      id, conversationId, senderId: uid, body,
      createdAt: new Date().toISOString(), deliveredAt: null, readAt: null, pending: true,
    };
    setMessages((prev) => [optimistic, ...prev]); // aparece al instante
    setText('');
    lastTypingSent.current = 0;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    channel.current?.sendTyping(false);
    try {
      await enqueueMessage(uid, { id, conversationId, body });
      kick();
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setText(body);
      Alert.alert('No se pudo enviar', e?.message ?? 'Inténtalo de nuevo.');
    }
  }

  // Estado solo en MI último mensaje: Enviando… / Enviado / Entregado / Visto
  const lastMineId = useMemo(() => messages.find((m) => m.senderId === uid)?.id, [messages, uid]);
  const statusOf = (m: ChatMessage) =>
    m.pending ? 'Enviando…' : m.readAt ? 'Visto' : m.deliveredAt ? 'Entregado' : 'Enviado';

  return (
    <View ref={rootRef} onLayout={measure} style={[s.screen, { paddingBottom: lift }]}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 44 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.who}
          activeOpacity={0.8}
          onPress={() => otherId && router.push(`/user/${otherId}` as any)}
        >
          <Avatar username={name ?? '?'} uri={avatar || null} size={34} />
          <View style={{ marginLeft: 10 }}>
            <Text style={s.name}>{name}</Text>
            {otherTyping && <Text style={s.typing}>escribiendo…</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : (
        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingVertical: 10 }}
          ListHeaderComponent={
            otherTyping ? (
              <View style={[s.bubble, s.theirs, s.typingBubble]}>
                <Text style={s.theirText}>···</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const mine = item.senderId === uid;
            return (
              <View style={[s.msgRow, mine ? s.msgRight : s.msgLeft]}>
                <View style={[s.bubble, mine ? s.mine : s.theirs, item.pending && { opacity: 0.6 }]}>
                  <Text style={mine ? s.myText : s.theirText}>{item.body}</Text>
                </View>
                <Text style={s.meta}>
                  {clock(item.createdAt)}
                  {mine && item.id === lastMineId ? `  ·  ${statusOf(item)}` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}

      <View style={[s.inputBar, { paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={s.input}
          placeholder="Mensaje…"
          placeholderTextColor={COLORS.muted}
          value={text}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity onPress={send} disabled={!text.trim()} hitSlop={8}>
          <Ionicons
            name="send"
            size={24}
            color={text.trim() ? COLORS.lavender : COLORS.border}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  who: { flexDirection: 'row', alignItems: 'center' },
  name: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  typing: { color: COLORS.lavender, fontSize: 12, marginTop: 1 },

  msgRow: { paddingHorizontal: 12, marginVertical: 3 },
  msgLeft: { alignItems: 'flex-start' },
  msgRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13 },
  mine: { backgroundColor: '#5602E6' },
  theirs: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  typingBubble: { marginLeft: 12, marginBottom: 6, alignSelf: 'flex-start' },
  myText: { color: COLORS.white, fontSize: 15 },
  theirText: { color: COLORS.white, fontSize: 15 },
  meta: { color: COLORS.muted, fontSize: 10, marginTop: 2, marginHorizontal: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, maxHeight: 110, color: COLORS.white, backgroundColor: COLORS.surface,
    borderRadius: 20, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
});