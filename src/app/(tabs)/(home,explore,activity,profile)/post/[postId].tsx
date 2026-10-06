import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../../constants/brand';
import { fetchPostById } from '../../../../data/postsRepository';
import { Post } from '../../../../domain/types';
import { useAuth } from '../../../../presentation/AuthProvider';
import { PostCard } from '../../../../presentation/PostCard';
import { sharePost } from '../../../../presentation/sharePost';
import { enqueueLike } from '../../../../sync/outbox';
import { applyPendingLikes } from '../../../../sync/overlay';
import { kick } from '../../../../sync/syncEngine';

/**
 * Detalle de UNA publicación. Es el destino de:
 *  - tocar una foto en la cuadrícula del perfil
 *  - un enlace compartido (noctamar://post/{uuid}), que en el Módulo 5 abrirá esta pantalla
 */
export default function PostDetail() {
  const { postId: id } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      let p = await fetchPostById(id);
      if (p && session) p = (await applyPendingLikes(session.user.id, [p]))[0];
      setPost(p);
      setMissing(!p); // null = no existe, o la regla de privacidad del servidor lo oculta
    } catch (e) {
      console.warn('post detail error', e);
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  // Se recarga al volver (por ejemplo, después de comentar cambia el contador)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Like optimista + cola offline (igual que en el feed)
  const onToggleLike = useCallback(async (p: Post) => {
    if (!session) return;
    const liked = !p.likedByMe;
    setPost((prev) =>
      prev ? { ...prev, likedByMe: liked, likeCount: Math.max(0, prev.likeCount + (liked ? 1 : -1)) } : prev
    );
    await enqueueLike(session.user.id, p.id, liked);
    kick();
  }, [session]);

  const onOpenComments = useCallback(
    (p: Post) => router.push(`/comments/${p.id}` as any),
    [router]
  );
  const onOpenAuthor = useCallback(
    (userId: string) => router.push(`/user/${userId}` as any),
    [router]
  );
  const onShare = useCallback((p: Post) => { sharePost(p); }, []);

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 60 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.title}>Publicación</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : post ? (
        <ScrollView>
          <PostCard
            post={post}
            onToggleLike={onToggleLike}
            onOpenComments={onOpenComments}
            onOpenAuthor={onOpenAuthor}
            onShare={onShare}
          />
        </ScrollView>
      ) : (
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={44} color={COLORS.lavender} />
          <Text style={s.emptyTitle}>
            {missing ? 'Esta publicación no está disponible' : 'No se pudo cargar'}
          </Text>
          <Text style={s.emptyText}>
            Puede que se haya eliminado o que pertenezca a una cuenta privada que aún no sigues.
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  emptyText: { color: COLORS.muted, marginTop: 6, textAlign: 'center' },
});