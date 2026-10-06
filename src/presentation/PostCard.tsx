import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CachedImage } from '../cache/CachedImage';
import { useIsVisible } from '../cache/viewport';
import { COLORS } from '../constants/brand';
import { Post } from '../domain/types';
import { Avatar } from './Avatar';

const { width } = Dimensions.get('window');

interface Props {
  post: Post;
  onToggleLike: (post: Post) => void;
  onOpenComments: (post: Post) => void;
  onOpenAuthor: (userId: string) => void;
  onShare: (post: Post) => void;
  /** Si se pasa, se muestra el botón "Seguir" cuando aún no sigues al autor */
  onFollow?: (post: Post) => void;
  /** true en el feed: la imagen solo se descarga mientras la celda está en pantalla */
  trackViewport?: boolean;
}

/** "hace 5 min", "hace 3 h", "hace 2 d"... */
export function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'hace un momento';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

// React.memo: evita re-renderizar celdas cuyo post no cambió (clave para 60 FPS)
function PostCardBase({
  post, onToggleLike, onOpenComments, onOpenAuthor, onShare, onFollow, trackViewport = false,
}: Props) {
  const visible = useIsVisible(post.id);
  const active = trackViewport ? visible : true;
  // Doble toque sobre la foto = dar "me gusta" (solo si aún no lo tiene, como Instagram)
  const lastTap = useRef(0);
  function onImagePress() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.likedByMe) onToggleLike(post);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <TouchableOpacity
          style={s.header}
          activeOpacity={0.8}
          onPress={() => onOpenAuthor(post.author.id)}
        >
          <View style={{ marginRight: 10 }}>
            <Avatar username={post.author.username} uri={post.author.avatar_url} />
          </View>
          <Text style={s.username}>{post.author.username}</Text>
        </TouchableOpacity>
        {onFollow && post.authorRelation === 'none' && (
          <TouchableOpacity style={s.followBtn} activeOpacity={0.8} onPress={() => onFollow(post)}>
            <Text style={s.followText}>Seguir</Text>
          </TouchableOpacity>
        )}
      </View>

      {post.imageUrl ? (
        <Pressable onPress={onImagePress}>
          <CachedImage
            cacheKey={post.imagePath}
            uri={post.imageUrl}
            style={s.image}
            active={active}
          />
        </Pressable>
      ) : (
        <View style={[s.image, s.noImage]}>
          <Text style={s.noImageText}>Imagen no disponible</Text>
        </View>
      )}

      <View style={s.actions}>
        <TouchableOpacity onPress={() => onToggleLike(post)} hitSlop={8}>
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={28}
            color={post.likedByMe ? COLORS.magenta : COLORS.white}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onOpenComments(post)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={25} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onShare(post)} hitSlop={8}>
          <Ionicons name="paper-plane-outline" size={25} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <Text style={s.likes}>{post.likeCount} Me gusta</Text>
      {post.caption ? (
        <Text style={s.caption}>
          <Text style={s.username}>{post.author.username} </Text>
          {post.caption}
        </Text>
      ) : null}
      <TouchableOpacity onPress={() => onOpenComments(post)}>
        <Text style={s.comments}>
          {post.commentCount > 0
            ? `Ver los ${post.commentCount} comentarios`
            : 'Añade un comentario…'}
        </Text>
      </TouchableOpacity>
      <Text style={s.time}>{timeAgo(post.createdAt).toUpperCase()}</Text>
    </View>
  );
}

export const PostCard = React.memo(PostCardBase);

const s = StyleSheet.create({
  card: { marginBottom: 18, backgroundColor: COLORS.black },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  header: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 10 },
  followBtn: {
    borderWidth: 1, borderColor: COLORS.lavender, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 14,
  },
  followText: { color: COLORS.lavender, fontWeight: '700', fontSize: 13 },
  username: { fontWeight: '600', color: COLORS.white },
  image: { width, height: width, backgroundColor: COLORS.surface },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  noImageText: { color: COLORS.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingTop: 10 },
  likes: { fontWeight: '600', paddingHorizontal: 12, paddingTop: 6, color: COLORS.white },
  caption: { paddingHorizontal: 12, paddingTop: 2, color: COLORS.white },
  comments: { color: COLORS.muted, paddingHorizontal: 12, paddingTop: 4 },
  time: { color: COLORS.muted, fontSize: 11, paddingHorizontal: 12, paddingTop: 4 },
});