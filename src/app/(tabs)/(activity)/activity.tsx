import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { COLORS, GRADIENT_MAIN } from '../../../constants/brand';
import { acceptRequest, fetchRequests, rejectRequest } from '../../../data/followsRepository';
import { FollowRequest } from '../../../domain/social';
import { Avatar } from '../../../presentation/Avatar';
import { refreshPendingBadge } from '../../../presentation/usePendingCount';

/** Pestaña Actividad: solicitudes de seguimiento pendientes (cuentas privadas). */
export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await fetchRequests());
    } catch (e) {
      console.warn('requests error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Se recarga cada vez que se entra a la pestaña
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Quita la fila al instante y llama al servidor; si falla, la devuelve. */
  async function resolve(req: FollowRequest, action: 'accept' | 'reject') {
    const backup = items;
    setItems((prev) => prev.filter((r) => r.followerId !== req.followerId));
    try {
      if (action === 'accept') await acceptRequest(req.followerId);
      else await rejectRequest(req.followerId);
      refreshPendingBadge(); // actualiza el globo de la barra inferior
    } catch (e: any) {
      setItems(backup);
      Alert.alert('No se pudo completar', e?.message ?? 'Inténtalo de nuevo.');
    }
  }

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Actividad</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.followerId}
          contentContainerStyle={items.length === 0 ? s.emptyWrap : undefined}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text style={s.sectionTitle}>Solicitudes de seguimiento</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <TouchableOpacity
                style={s.person}
                activeOpacity={0.8}
                onPress={() => router.push(`/user/${item.followerId}` as any)}
              >
                <Avatar username={item.user.username} uri={item.user.avatar_url} size={46} />
                <View style={s.textCol}>
                  <Text style={s.username} numberOfLines={1}>{item.user.username}</Text>
                  {!!item.user.full_name && (
                    <Text style={s.fullName} numberOfLines={1}>{item.user.full_name}</Text>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => resolve(item, 'accept')} activeOpacity={0.85}>
                <LinearGradient
                  colors={GRADIENT_MAIN}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.acceptBtn}
                >
                  <Text style={s.acceptText}>Confirmar</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.rejectBtn}
                onPress={() => resolve(item, 'reject')}
                activeOpacity={0.85}
              >
                <Text style={s.rejectText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="heart-outline" size={52} color={COLORS.lavender} />
              <Text style={s.emptyTitle}>Todo al día</Text>
              <Text style={s.emptyText}>Aquí verás las solicitudes para seguirte.</Text>
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
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { color: COLORS.white, fontSize: 22, fontWeight: '700' },
  sectionTitle: { color: COLORS.white, fontWeight: '700', fontSize: 15, padding: 16, paddingBottom: 6 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  textCol: { flex: 1, marginLeft: 10 },
  username: { color: COLORS.white, fontWeight: '700' },
  fullName: { color: COLORS.muted, marginTop: 2 },

  acceptBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  acceptText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  rejectText: { color: COLORS.white, fontWeight: '600', fontSize: 13 },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptyText: { color: COLORS.muted, marginTop: 6 },
});