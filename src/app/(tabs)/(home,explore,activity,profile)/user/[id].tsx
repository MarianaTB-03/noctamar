import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert, Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '../../../../cache/CachedImage';
import { COLORS, GRADIENT_MAIN } from '../../../../constants/brand';
import { fetchUserProfile, followUser, unfollowUser } from '../../../../data/followsRepository';
import { startConversation } from '../../../../data/messagesRepository';
import { GridPost } from '../../../../domain/profile';
import { Relation, UserProfileData } from '../../../../domain/social';
import { Avatar } from '../../../../presentation/Avatar';

const CELL = Dimensions.get('window').width / 3;

function Stat({
  value, label, onPress,
}: { value: number; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.stat} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await fetchUserProfile(id));
    } catch (e) {
      console.warn('user profile error', e);
    } finally {
      setLoading(false); // solo el primer arranque muestra el spinner de pantalla completa
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** UI optimista: el botón y el contador cambian al instante; si falla, se revierte. */
  async function change(action: 'follow' | 'unfollow') {
    if (!data || busy) return;
    const prev = data;
    const next: Relation =
      action === 'unfollow' ? 'none' : prev.profile.is_private ? 'pending' : 'accepted';
    const wasAccepted = prev.relation === 'accepted';
    const delta = (next === 'accepted' ? 1 : 0) - (wasAccepted ? 1 : 0);

    setData({
      ...prev,
      relation: next,
      canView: prev.isMe || !prev.profile.is_private || next === 'accepted',
      stats: { ...prev.stats, followerCount: Math.max(0, prev.stats.followerCount + delta) },
    });
    setBusy(true);
    try {
      if (action === 'follow') await followUser(prev.profile.id);
      else await unfollowUser(prev.profile.id);
      await load(); // sincroniza con lo que decidió el servidor (estado real, fotos, contadores)
    } catch (e: any) {
      setData(prev);
      Alert.alert('No se pudo completar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  /** Abre el chat con esta persona (el servidor lo crea si no existía). */
  async function openChat() {
    if (!data) return;
    try {
      const conversationId = await startConversation(data.profile.id);
      router.push({
        pathname: '/chat/[conversationId]',
        params: {
          conversationId,
          otherId: data.profile.id,
          name: data.profile.username,
          avatar: data.profile.avatar_url ?? '',
        },
      } as any);
    } catch (e: any) {
      Alert.alert('No se pudo abrir el chat', e?.message ?? 'Inténtalo de nuevo.');
    }
  }

  function onPressFollow() {
    if (!data) return;
    if (data.relation === 'accepted') {
      Alert.alert(`Dejar de seguir a @${data.profile.username}`, undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Dejar de seguir', style: 'destructive', onPress: () => change('unfollow') },
      ]);
    } else if (data.relation === 'pending') {
      change('unfollow'); // cancelar solicitud
    } else {
      change('follow');
    }
  }

  if (loading) {
    return (
      <View style={[s.screen, { justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <StatusBar style="light" />
        <Ionicons name="person-remove-outline" size={48} color={COLORS.lavender} />
        <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 12 }}>
          Perfil no disponible
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.lavender, fontWeight: '600' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { profile, stats, relation, isMe, canView } = data;

  const label =
    relation === 'accepted' ? 'Siguiendo' : relation === 'pending' ? 'Solicitado' : 'Seguir';

  const header = (
    <View>
      <View style={s.info}>
        <Avatar username={profile.username} uri={profile.avatar_url} size={86} />
        <View style={s.stats}>
          <Stat value={stats.postCount} label="publicaciones" />
          <Stat
            value={stats.followerCount}
            label="seguidores"
            onPress={() => router.push(`/connections/${profile.id}?kind=followers&name=${encodeURIComponent(profile.username)}` as any)}
          />
          <Stat
            value={stats.followingCount}
            label="seguidos"
            onPress={() => router.push(`/connections/${profile.id}?kind=following&name=${encodeURIComponent(profile.username)}` as any)}
          />
        </View>
      </View>

      <View style={s.bioBlock}>
        {!!profile.full_name && <Text style={s.fullName}>{profile.full_name}</Text>}
        {!!profile.bio && <Text style={s.bio}>{profile.bio}</Text>}
      </View>

      {!isMe && (
        <View style={s.buttons}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={onPressFollow}
            disabled={busy}
            activeOpacity={0.85}
          >
            {relation === 'none' ? (
              <LinearGradient
                colors={GRADIENT_MAIN}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.followBtn}
              >
                <Text style={s.followText}>{label}</Text>
              </LinearGradient>
            ) : (
              <View style={[s.followBtn, s.followBtnGhost]}>
                <Text style={s.followText}>{label}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.followBtn, s.followBtnGhost, { flex: 1 }]}
            onPress={openChat}
            activeOpacity={0.85}
          >
            <Text style={s.followText}>Mensaje</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.gridTab}>
        <Ionicons name="grid" size={24} color={COLORS.white} />
      </View>
    </View>
  );

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 48 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <View style={s.nameRow}>
          {profile.is_private && (
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.white} style={{ marginRight: 5 }} />
          )}
          <Text style={s.username} numberOfLines={1}>{profile.username}</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <FlatList<GridPost>
        data={canView ? data.posts : []}
        keyExtractor={(p) => p.id}
        numColumns={3}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push(`/post/${item.id}` as any)}
          >
            {item.imageUrl ? (
              <CachedImage cacheKey={item.imagePath} uri={item.imageUrl} style={s.cell} />
            ) : (
              <View style={s.cell} />
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          canView ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Aún no hay publicaciones</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="lock-closed-outline" size={44} color={COLORS.lavender} />
              <Text style={s.emptyTitle}>Esta cuenta es privada</Text>
              <Text style={s.emptyText}>Síguela para ver sus fotos.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  username: { color: COLORS.white, fontSize: 18, fontWeight: '700', flexShrink: 1 },

  info: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 12 },
  stat: { alignItems: 'center' },
  statValue: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  statLabel: { color: COLORS.white, fontSize: 12, marginTop: 2 },

  bioBlock: { paddingHorizontal: 16, paddingTop: 12 },
  fullName: { color: COLORS.white, fontWeight: '700' },
  bio: { color: COLORS.white, marginTop: 2 },

  buttons: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  followBtn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  followBtnGhost: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  followText: { color: COLORS.white, fontWeight: '700' },

  gridTab: {
    alignItems: 'center', paddingVertical: 10, marginTop: 14,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.white,
  },
  cell: { width: CELL - 1, height: CELL - 1, margin: 0.5, backgroundColor: COLORS.surface },

  empty: { alignItems: 'center', padding: 40 },
  emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: '700', marginTop: 10 },
  emptyText: { color: COLORS.muted, marginTop: 6 },
});