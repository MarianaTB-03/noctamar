import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { setVisibleIds } from '../../../cache/viewport';
import { COLORS } from '../../../constants/brand';
import { followUser } from '../../../data/followsRepository';
import { fetchFeed } from '../../../data/postsRepository';
import { Post } from '../../../domain/types';
import { AppHeader } from '../../../presentation/AppHeader';
import { useAuth } from '../../../presentation/AuthProvider';
import { PostCard } from '../../../presentation/PostCard';
import { sharePost } from '../../../presentation/sharePost';
import { StoryTray } from '../../../presentation/StoryTray';
import { refreshTray } from '../../../stories/trayStore';
import { enqueueLike } from '../../../sync/outbox';
import { applyPendingLikes } from '../../../sync/overlay';
import { kick, onSyncResult } from '../../../sync/syncEngine';

export default function Feed() {
  const router = useRouter();
  const { session } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const endReached = useRef(false);
  const loadingMore = useRef(false);
  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;

  const load = useCallback(async (reset: boolean) => {
    if (loadingMore.current) return;
    if (!reset && endReached.current) return;
    loadingMore.current = true;
    try {
      const cursor = reset ? undefined : posts[posts.length - 1]?.createdAt;
      let page = await fetchFeed(cursor);
      if (session) page = await applyPendingLikes(session.user.id, page); // respeta likes aún no enviados
      endReached.current = page.length === 0;
      setPosts((prev) => (reset ? page : [...prev, ...page]));
    } catch (e) {
      console.warn('feed error', e);
    } finally {
      loadingMore.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [posts, session]);

  // Recarga al entrar y cada vez que se vuelve a esta pantalla
  // (tras publicar o comentar, los contadores se actualizan solos)
  useFocusEffect(
    useCallback(() => {
      if (session) {
        endReached.current = false;
        load(true);
        refreshTray(session.user.id); // historias vigentes (se reordenan al volver del visor)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session])
  );

  // LIKE OPTIMISTA: la pantalla cambia al instante (0 ms) y la petición va a la cola SQLite,
  // que la envía ahora mismo si hay internet o más tarde si no lo hay.
  const onToggleLike = useCallback(async (post: Post) => {
    if (!session) return;
    const liked = !post.likedByMe;
    setPosts((prev) => prev.map((p) =>
      p.id === post.id ? { ...p, likedByMe: liked, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) } : p
    ));
    await enqueueLike(session.user.id, post.id, liked);
    kick();
  }, [session]);

  // Si el servidor rechaza definitivamente un like (p. ej. el post fue borrado), se revierte la pantalla
  useEffect(() => {
    return onSyncResult((r) => {
      if (r.type !== 'like' || r.status !== 'failed') return;
      const liked: boolean = r.payload.liked;
      setPosts((prev) => prev.map((p) =>
        p.id === r.payload.postId && p.likedByMe === liked
          ? { ...p, likedByMe: !liked, likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)) }
          : p
      ));
    });
  }, []);

  // Seguir desde la publicación: el botón desaparece al instante (UI optimista).
  // El servidor decide si queda "accepted" (cuenta pública) o "pending" (privada); si falla, se revierte.
  const onFollow = useCallback(async (post: Post) => {
    const authorId = post.author.id;
    const setRel = (rel: 'none' | 'accepted') =>
      setPosts((prev) => prev.map((p) => (p.author.id === authorId ? { ...p, authorRelation: rel } : p)));
    setRel('accepted');
    try {
      await followUser(authorId);
    } catch (e) {
      console.warn('follow error', e);
      setRel('none');
    }
  }, []);

  const onOpenComments = useCallback(
    (post: Post) => router.push(`/comments/${post.id}` as any),
    [router]
  );

  const onOpenAuthor = useCallback(
    (userId: string) => router.push(`/user/${userId}` as any),
    [router]
  );

  const onShare = useCallback((post: Post) => { sharePost(post); }, []);

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
        onOpenAuthor={onOpenAuthor}
        onShare={onShare}
        onFollow={onFollow}
        trackViewport
      />
    ),
    [onToggleLike, onOpenComments, onOpenAuthor, onShare, onFollow]
  );

  // Viewport: publica qué celdas están en pantalla (+ la siguiente, para ir un paso adelante).
  // Las que salen cancelan su descarga. Las referencias deben ser estables: FlatList no admite cambiarlas.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: Post; index: number | null }[] }) => {
      const ids = viewableItems.map((v) => v.item.id);
      const last = Math.max(-1, ...viewableItems.map((v) => v.index ?? -1));
      const next = postsRef.current[last + 1];
      if (next) ids.push(next.id);
      setVisibleIds(ids);
    }
  ).current;

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <AppHeader />
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : (
        <FlatList
          data={posts}
          ListHeaderComponent={<StoryTray />}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => load(false)}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); endReached.current = false; load(true); if (session) refreshTray(session.user.id); }}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          contentContainerStyle={posts.length === 0 ? s.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Aún no hay publicaciones</Text>
              <Text style={s.emptyText}>Toca el + de arriba para publicar tu primera foto.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginBottom: 6 },
  emptyText: { color: COLORS.muted, textAlign: 'center' },
});