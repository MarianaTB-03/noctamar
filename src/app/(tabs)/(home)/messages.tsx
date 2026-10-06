import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert,
    FlatList,
    StyleSheet,
    Text, TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/brand';
import { searchProfiles } from '../../../data/followsRepository';
import { fetchInbox, startConversation } from '../../../data/messagesRepository';
import { InboxItem } from '../../../domain/messages';
import { SearchResult } from '../../../domain/social';
import { onInboxChange } from '../../../messaging/realtime';
import { useAuth } from '../../../presentation/AuthProvider';
import { Avatar } from '../../../presentation/Avatar';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** Bandeja de entrada: conversaciones ordenadas por el último mensaje, en tiempo real. */
export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    try {
      setItems(await fetchInbox());
    } catch (e) {
      console.warn('inbox error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Cada mensaje nuevo (o cambio de visto) recarga la bandeja: se reordena sola
  useEffect(() => onInboxChange(load), [load]);

  // Buscar a alguien para iniciar un chat nuevo
  useEffect(() => {
    const q = query.trim();
    if (!q) { requestId.current++; setResults([]); return; }
    const timer = setTimeout(async () => {
      const mine = ++requestId.current;
      try {
        const list = await searchProfiles(q);
        if (mine === requestId.current) setResults(list);
      } catch { /* */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function openChat(conversationId: string, other: { id: string; username: string; avatar_url: string | null }) {
    setQuery('');
    router.push({
      pathname: '/chat/[conversationId]',
      params: { conversationId, otherId: other.id, name: other.username, avatar: other.avatar_url ?? '' },
    } as any);
  }

  async function startWith(person: SearchResult) {
    try {
      const conversationId = await startConversation(person.id);
      openChat(conversationId, person);
    } catch (e: any) {
      Alert.alert('No se pudo abrir el chat', e?.message ?? 'Inténtalo de nuevo.');
    }
  }

  const searching = query.trim().length > 0;

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 60 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.title}>Mensajes</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={COLORS.muted} />
        <TextInput
          style={s.search}
          placeholder="Buscar para escribir a alguien"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : searching ? (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={() => startWith(item)}>
              <Avatar username={item.username} uri={item.avatar_url} size={48} />
              <View style={s.col}>
                <Text style={s.name}>{item.username}</Text>
                {!!item.full_name && <Text style={s.preview}>{item.full_name}</Text>}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>No encontramos a nadie con ese nombre.</Text>}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.conversationId}
          renderItem={({ item }) => {
            const unread = item.unread > 0;
            const mine = item.lastSender === uid;
            return (
              <TouchableOpacity
                style={s.row}
                activeOpacity={0.8}
                onPress={() => openChat(item.conversationId, item.other)}
              >
                <Avatar username={item.other.username} uri={item.other.avatar_url} size={52} />
                <View style={s.col}>
                  <Text style={[s.name, unread && s.bold]}>{item.other.username}</Text>
                  <Text style={[s.preview, unread && s.previewUnread]} numberOfLines={1}>
                    {mine ? 'Tú: ' : ''}{item.lastBody} · {timeAgo(item.lastMessageAt)}
                  </Text>
                </View>
                {unread && (
                  <View style={s.badge}><Text style={s.badgeText}>{item.unread}</Text></View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="paper-plane-outline" size={48} color={COLORS.lavender} />
              <Text style={s.emptyTitle}>Aún no tienes mensajes</Text>
              <Text style={s.empty}>Busca a alguien arriba o toca "Mensaje" en su perfil.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10,
  },
  title: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8,
    backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  search: { flex: 1, color: COLORS.white, paddingVertical: 9, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  col: { flex: 1, marginLeft: 12 },
  name: { color: COLORS.white, fontSize: 15 },
  bold: { fontWeight: '800' },
  preview: { color: COLORS.muted, marginTop: 2, fontSize: 13 },
  previewUnread: { color: COLORS.white, fontWeight: '700' },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: COLORS.magenta, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  emptyBox: { alignItems: 'center', padding: 48, gap: 10 },
  emptyTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  empty: { color: COLORS.muted, textAlign: 'center', padding: 16 },
});