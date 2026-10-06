import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENT_MAIN } from '../../../../constants/brand';
import { fetchConnections, followUser, unfollowUser } from '../../../../data/followsRepository';
import { Connection, ConnectionKind, Relation } from '../../../../domain/social';
import { useAuth } from '../../../../presentation/AuthProvider';
import { Avatar } from '../../../../presentation/Avatar';

export default function ConnectionsScreen() {
  const { id, kind: kindParam, name } = useLocalSearchParams<{
    id: string; kind?: string; name?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [kind, setKind] = useState<ConnectionKind>(
    kindParam === 'following' ? 'following' : 'followers'
  );
  const [lists, setLists] = useState<Partial<Record<ConnectionKind, Connection[]>>>({});
  const [locked, setLocked] = useState(false); // el servidor negó el acceso (cuenta privada)
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (k: ConnectionKind) => {
    if (!id) return;
    setLoading(true);
    try {
      const list = await fetchConnections(id, k);
      setLists((prev) => ({ ...prev, [k]: list }));
      setLocked(false);
    } catch (e: any) {
      if (e?.code === 'private') setLocked(true);
      else console.warn('connections error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Se recarga al cambiar de pestaña y al volver a la pantalla (el estado de "seguir" pudo cambiar)
  useFocusEffect(useCallback(() => { load(kind); }, [load, kind]));

  const setRelation = useCallback((personId: string, rel: Relation) => {
    setLists((prev) => ({
      ...prev,
      [kind]: (prev[kind] ?? []).map((x) => (x.id === personId ? { ...x, relation: rel } : x)),
    }));
  }, [kind]);

  async function run(c: Connection) {
    const prevRel = c.relation;
    const unfollow = prevRel !== 'none';
    setBusyId(c.id);
    setRelation(c.id, unfollow ? 'none' : c.is_private ? 'pending' : 'accepted'); // optimista
    try {
      if (unfollow) await unfollowUser(c.id);
      else setRelation(c.id, await followUser(c.id)); // el servidor decide el estado real
    } catch (e: any) {
      setRelation(c.id, prevRel); // revierte
      Alert.alert('No se pudo completar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  }

  function onPressFollow(c: Connection) {
    if (busyId) return;
    if (c.relation === 'accepted') {
      Alert.alert(`Dejar de seguir a @${c.username}`, undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Dejar de seguir', style: 'destructive', onPress: () => run(c) },
      ]);
    } else {
      run(c);
    }
  }

  const data = lists[kind] ?? [];

  function Tab({ k, label }: { k: ConnectionKind; label: string }) {
    const active = kind === k;
    return (
      <TouchableOpacity style={[s.tab, active && s.tabActive]} onPress={() => setKind(k)}>
        <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 48 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{name ?? 'Conexiones'}</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={s.tabs}>
        <Tab k="followers" label="Seguidores" />
        <Tab k="following" label="Seguidos" />
      </View>

      {locked ? (
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={44} color={COLORS.lavender} />
          <Text style={s.emptyTitle}>Esta cuenta es privada</Text>
          <Text style={s.emptyText}>Síguela y espera su aprobación para ver esta lista.</Text>
        </View>
      ) : loading && data.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          contentContainerStyle={data.length === 0 ? s.emptyWrap : undefined}
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

              {item.id !== uid && (
                <TouchableOpacity
                  onPress={() => onPressFollow(item)}
                  disabled={busyId === item.id}
                  activeOpacity={0.85}
                >
                  {item.relation === 'none' ? (
                    <LinearGradient
                      colors={GRADIENT_MAIN}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.followBtn}
                    >
                      <Text style={s.followText}>Seguir</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[s.followBtn, s.followGhost]}>
                      <Text style={s.followText}>
                        {item.relation === 'pending' ? 'Solicitado' : 'Siguiendo'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyTitle}>
                {kind === 'followers' ? 'Aún no hay seguidores' : 'Aún no sigue a nadie'}
              </Text>
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
  title: { color: COLORS.white, fontSize: 17, fontWeight: '700', flexShrink: 1 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.white },
  tabText: { color: COLORS.muted, fontWeight: '600' },
  tabTextActive: { color: COLORS.white },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  textCol: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  username: { color: COLORS.white, fontWeight: '700', flexShrink: 1 },
  fullName: { color: COLORS.muted, marginTop: 2 },

  followBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  followGhost: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  followText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  emptyText: { color: COLORS.muted, marginTop: 6, textAlign: 'center' },
});