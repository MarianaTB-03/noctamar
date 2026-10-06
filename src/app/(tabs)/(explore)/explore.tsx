import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text, TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/brand';
import { searchProfiles } from '../../../data/followsRepository';
import { SearchResult } from '../../../domain/social';
import { Avatar } from '../../../presentation/Avatar';

/** Pestaña Explorar: búsqueda de personas. */
export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0); // descarta respuestas viejas que llegan tarde

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      requestId.current++;
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    // Debounce: espera 300 ms sin escribir para no consultar en cada tecla
    const timer = setTimeout(async () => {
      const mine = ++requestId.current;
      setLoading(true);
      try {
        const list = await searchProfiles(q);
        if (mine === requestId.current) {
          setResults(list);
          setSearched(true);
        }
      } catch (e) {
        console.warn('search error', e);
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <TextInput
            style={s.input}
            placeholder="Buscar personas"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
          {loading && <ActivityIndicator size="small" color={COLORS.lavender} />}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            activeOpacity={0.8}
            onPress={() => router.push(`/user/${item.id}` as any)}
          >
            <Avatar username={item.username} uri={item.avatar_url} size={46} />
            <View style={s.textCol}>
              <View style={s.nameLine}>
                <Text style={s.username} numberOfLines={1}>{item.username}</Text>
                {item.is_private && (
                  <Ionicons name="lock-closed-outline" size={13} color={COLORS.muted} style={{ marginLeft: 6 }} />
                )}
              </View>
              {!!item.full_name && <Text style={s.fullName} numberOfLines={1}>{item.full_name}</Text>}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={44} color={COLORS.lavender} />
            <Text style={s.emptyText}>
              {searched ? 'No encontramos a nadie con ese nombre.' : 'Busca a tus amigos por su nombre de usuario.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  input: { flex: 1, color: COLORS.white, paddingVertical: 10, fontSize: 15 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  textCol: { marginLeft: 12, flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  username: { color: COLORS.white, fontWeight: '700', flexShrink: 1 },
  fullName: { color: COLORS.muted, marginTop: 2 },

  empty: { padding: 48, alignItems: 'center', gap: 12 },
  emptyText: { color: COLORS.muted, textAlign: 'center' },
});