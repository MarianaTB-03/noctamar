import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '../../../cache/CachedImage';
import { clearImageCache } from '../../../cache/imageCache';
import { BRAND, COLORS } from '../../../constants/brand';
import { fetchPendingCount } from '../../../data/followsRepository';
import { fetchMyProfile } from '../../../data/profileRepository';
import { supabase } from '../../../data/supabase';
import { GridPost, MyProfileData } from '../../../domain/profile';
import { useAuth } from '../../../presentation/AuthProvider';
import { Avatar } from '../../../presentation/Avatar';

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

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [data, setData] = useState<MyProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([fetchMyProfile(), fetchPendingCount()]);
      setData(d);
      setPending(n);
    } catch (e) {
      console.warn('profile error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarga cada vez que la pestaña recupera el foco (al volver de editar o publicar)
  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  function confirmSignOut() {
    Alert.alert('Cerrar sesión', '¿Quieres salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        // scope local: cierra solo este dispositivo y NO necesita internet
        onPress: async () => {
          // Privacidad: las fotos de cuentas privadas no deben quedar en el disco tras salir
          await clearImageCache().catch(() => {});
          await supabase.auth.signOut({ scope: 'local' });
        },
      },
    ]);
  }

  function openMenu() {
    Alert.alert(data ? `@${data.profile.username}` : 'Menú', undefined, [
      { text: 'Editar perfil', onPress: () => router.push('/edit-profile' as any) },
      { text: 'Cerrar sesión', style: 'destructive', onPress: confirmSignOut },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function shareProfile() {
    if (!data) return;
    await Share.share({ message: `Sígueme en ${BRAND.name}: @${data.profile.username}` });
  }

  if (loading) {
    return (
      <View style={[s.screen, { justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  // La carga terminó pero no hay datos: antes se quedaba cargando para siempre.
  if (!data) {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <StatusBar style="light" />
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.lavender} />
        <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 12 }}>
          No se pudo cargar tu perfil
        </Text>
        <TouchableOpacity
          onPress={() => { setLoading(true); load(); }}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: COLORS.lavender, fontWeight: '600' }}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmSignOut} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.muted, fontWeight: '600' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { profile } = data;

  const header = (
    <View>
      <View style={s.info}>
        <Avatar username={profile.username} uri={profile.avatar_url} size={86} />
        <View style={s.stats}>
          <Stat value={data.postCount} label="publicaciones" />
          <Stat
            value={data.followerCount}
            label="seguidores"
            onPress={() => router.push(`/connections/${profile.id}?kind=followers&name=${encodeURIComponent(profile.username)}` as any)}
          />
          <Stat
            value={data.followingCount}
            label="seguidos"
            onPress={() => router.push(`/connections/${profile.id}?kind=following&name=${encodeURIComponent(profile.username)}` as any)}
          />
        </View>
      </View>

      <View style={s.bioBlock}>
        {!!profile.full_name && <Text style={s.fullName}>{profile.full_name}</Text>}
        {!!profile.bio && <Text style={s.bio}>{profile.bio}</Text>}
      </View>

      <View style={s.buttons}>
        <TouchableOpacity
          style={s.btn}
          onPress={() => router.push('/edit-profile' as any)}
          activeOpacity={0.8}
        >
          <Text style={s.btnText}>Editar perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={shareProfile} activeOpacity={0.8}>
          <Text style={s.btnText}>Compartir perfil</Text>
        </TouchableOpacity>
      </View>

      {pending > 0 && (
        <TouchableOpacity
          style={s.requestsRow}
          onPress={() => router.push('/activity' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.white} />
          <Text style={s.requestsText}>Solicitudes de seguimiento</Text>
          <View style={s.badge}><Text style={s.badgeText}>{pending}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
        </TouchableOpacity>
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
        <View style={s.nameRow}>
          {profile.is_private && (
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
          )}
          <Text style={s.username} numberOfLines={1}>{profile.username}</Text>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity onPress={() => router.push('/create' as any)} hitSlop={10}>
            <Ionicons name="add-circle-outline" size={28} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openMenu} hitSlop={10}>
            <Ionicons name="menu-outline" size={30} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList<GridPost>
        data={data.posts}
        keyExtractor={(p) => p.id}
        numColumns={3}
        ListHeaderComponent={header}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); load(); }}
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
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Aún no has publicado</Text>
            <TouchableOpacity onPress={() => router.push('/create' as any)}>
              <Text style={s.emptyLink}>Comparte tu primera foto</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  username: { color: COLORS.white, fontSize: 21, fontWeight: '700', flexShrink: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  info: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 12 },
  stat: { alignItems: 'center' },
  statValue: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  statLabel: { color: COLORS.white, fontSize: 12, marginTop: 2 },

  bioBlock: { paddingHorizontal: 16, paddingTop: 12 },
  fullName: { color: COLORS.white, fontWeight: '700' },
  bio: { color: COLORS.white, marginTop: 2 },

  buttons: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  btn: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 8, paddingVertical: 9,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  btnText: { color: COLORS.white, fontWeight: '600' },

  requestsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  requestsText: { color: COLORS.white, fontWeight: '600', flex: 1 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: COLORS.magenta, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },

  gridTab: {
    alignItems: 'center', paddingVertical: 10, marginTop: 14,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.white,
  },
  cell: { width: CELL - 1, height: CELL - 1, margin: 0.5, backgroundColor: COLORS.surface },

  empty: { alignItems: 'center', padding: 40 },
  emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyLink: { color: COLORS.lavender, fontWeight: '600' },
});