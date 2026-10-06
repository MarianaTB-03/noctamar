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
  addComment, deleteComment, fetchAuthor, fetchComments, subscribeToComments,
} from '../../../../data/commentsRepository';
import { Comment, CommentAuthor, Thread } from '../../../../domain/comments';
import { useAuth } from '../../../../presentation/AuthProvider';
import { Avatar } from '../../../../presentation/Avatar';
import { useKeyboardHeight } from '../../../../presentation/useKeyboardHeight';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** Agrupa en hilos: cada respuesta (a cualquier nivel) cuelga de su comentario raíz. */
function buildThreads(list: Comment[]): Thread[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const rootOf = (c: Comment): string => {
    let cur = c;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur.id;
  };
  const threads = new Map<string, Thread>();
  list.filter((c) => !c.parentId || !byId.has(c.parentId)).forEach((c) =>
    threads.set(c.id, { root: c, replies: [] })
  );
  list.forEach((c) => {
    if (threads.has(c.id)) return;
    threads.get(rootOf(c))?.replies.push(c);
  });
  return [...threads.values()];
}

/** Ids de un comentario y todos sus descendientes (borrar el padre borra las respuestas). */
function withDescendants(list: Comment[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of list) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

interface RowProps {
  c: Comment;
  isReply?: boolean;
  mine: boolean;
  onReply: (c: Comment) => void;
  onDelete: (c: Comment) => void;
}

function CommentRow({ c, isReply, mine, onReply, onDelete }: RowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => mine && onDelete(c)}
      style={[s.row, isReply && s.reply, c.pending && { opacity: 0.55 }]}
    >
      <Avatar username={c.author.username} uri={c.author.avatar_url} size={isReply ? 26 : 34} />
      <View style={s.bodyCol}>
        <Text style={s.text}>
          <Text style={s.user}>{c.author.username} </Text>
          {c.body}
        </Text>
        <View style={s.meta}>
          <Text style={s.metaText}>{c.pending ? 'Enviando…' : timeAgo(c.createdAt)}</Text>
          {!c.pending && (
            <TouchableOpacity onPress={() => onReply(c)} hitSlop={8}>
              <Text style={[s.metaText, s.metaBold]}>Responder</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const keyboard = useKeyboardHeight();
  // Espacio libre bajo esta pantalla (la barra de pestañas): se mide, no se asume.
  // Solo se sube lo que el teclado sobrepasa de ese espacio.
  const rootRef = useRef<View>(null);
  const [spaceBelow, setSpaceBelow] = useState(0);
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      setSpaceBelow(Math.max(0, Dimensions.get('window').height - (y + h)));
    });
  }, []);
  const lift = Math.max(0, keyboard - spaceBelow);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);

  const me = useRef<CommentAuthor | null>(null);
  const authors = useRef(new Map<string, CommentAuthor>()); // caché para los eco de Realtime
  const inputRef = useRef<TextInput>(null);

  // Carga inicial + suscripción en tiempo real
  useEffect(() => {
    if (!postId) return;
    let alive = true;

    (async () => {
      try {
        const [list, mine] = await Promise.all([fetchComments(postId), fetchAuthor(uid)]);
        if (!alive) return;
        me.current = mine;
        list.forEach((c) => authors.current.set(c.author.id, c.author));
        setComments(list);
      } catch (e) {
        console.warn('comments load error', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const unsubscribe = subscribeToComments(postId, {
      onInsert: async (row) => {
        let author = authors.current.get(row.user_id) ?? null;
        if (!author) {
          author = await fetchAuthor(row.user_id);
          if (author) authors.current.set(author.id, author);
        }
        if (!alive || !author) return;
        setComments((prev) => {
          if (prev.some((c) => c.id === row.id)) {
            // Es el eco de mi propio comentario: confirmo el optimista, no lo duplico
            return prev.map((c) => (c.id === row.id ? { ...c, pending: false } : c));
          }
          return [
            ...prev,
            {
              id: row.id, postId: row.post_id, parentId: row.parent_id,
              body: row.body, createdAt: row.created_at, author,
            },
          ];
        });
      },
      onDelete: (id) =>
        setComments((prev) => {
          if (!prev.some((c) => c.id === id)) return prev; // no era de este post
          const gone = withDescendants(prev, id);
          return prev.filter((c) => !gone.has(c.id));
        }),
    });

    return () => { alive = false; unsubscribe(); };
  }, [postId, uid]);

  const threads = useMemo(() => buildThreads(comments), [comments]);

  const startReply = useCallback((c: Comment) => {
    setReplyTo(c);
    inputRef.current?.focus();
  }, []);

  const confirmDelete = useCallback((c: Comment) => {
    Alert.alert('Eliminar comentario', 'También se eliminarán sus respuestas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const backup = comments;
          setComments((prev) => {
            const gone = withDescendants(prev, c.id);
            return prev.filter((x) => !gone.has(x.id));
          });
          try {
            await deleteComment(c.id);
          } catch (e: any) {
            setComments(backup); // revierte si el servidor lo rechaza
            Alert.alert('No se pudo eliminar', e?.message ?? 'Inténtalo de nuevo.');
          }
        },
      },
    ]);
  }, [comments]);

  async function send() {
    const body = text.trim();
    if (!body || sending || !postId || !me.current) return;

    const id = Crypto.randomUUID(); // id del cliente => idempotente y sin duplicados
    const optimistic: Comment = {
      id, postId, parentId: replyTo?.id ?? null, body,
      createdAt: new Date().toISOString(), author: me.current, pending: true,
    };

    setComments((prev) => [...prev, optimistic]); // aparece al instante
    setText('');
    setReplyTo(null);
    setSending(true);
    try {
      await addComment({ id, postId, userId: uid, parentId: optimistic.parentId, body });
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, pending: false } : c)));
    } catch (e: any) {
      setComments((prev) => prev.filter((c) => c.id !== id)); // revierte
      setText(body);
      Alert.alert('No se pudo comentar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View ref={rootRef} onLayout={measure} style={[s.screen, { paddingBottom: lift }]}>
      <StatusBar style="light" />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ width: 60 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.title}>Comentarios</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.lavender} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.root.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={threads.length === 0 ? s.emptyWrap : { paddingVertical: 8 }}
          renderItem={({ item }) => (
            <View>
              <CommentRow
                c={item.root} mine={item.root.author.id === uid}
                onReply={startReply} onDelete={confirmDelete}
              />
              {item.replies.map((r) => (
                <CommentRow
                  key={r.id} c={r} isReply mine={r.author.id === uid}
                  onReply={startReply} onDelete={confirmDelete}
                />
              ))}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center' }}>
              <Text style={s.emptyTitle}>Aún no hay comentarios</Text>
              <Text style={s.emptyText}>Sé el primero en comentar.</Text>
            </View>
          }
        />
      )}

      {replyTo && (
        <View style={s.replyBanner}>
          <Text style={s.replyText} numberOfLines={1}>
            Respondiendo a <Text style={{ fontWeight: '700' }}>@{replyTo.author.username}</Text>
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}>
            <Ionicons name="close" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={s.inputBar}>
        <Avatar username={me.current?.username ?? '?'} uri={me.current?.avatar_url ?? null} size={32} />
        <TextInput
          ref={inputRef}
          style={s.input}
          placeholder={replyTo ? 'Escribe tu respuesta…' : 'Añade un comentario…'}
          placeholderTextColor={COLORS.muted}
          value={text}
          onChangeText={setText}
          maxLength={1000}
          multiline
        />
        <TouchableOpacity onPress={send} disabled={!text.trim() || sending} hitSlop={8}>
          <Text style={[s.send, (!text.trim() || sending) && { opacity: 0.35 }]}>Publicar</Text>
        </TouchableOpacity>
      </View>
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

  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 },
  reply: { paddingLeft: 58 }, // sangría de respuestas
  bodyCol: { flex: 1, marginLeft: 10 },
  text: { color: COLORS.white, lineHeight: 20 },
  user: { fontWeight: '700' },
  meta: { flexDirection: 'row', gap: 16, marginTop: 4 },
  metaText: { color: COLORS.muted, fontSize: 12 },
  metaBold: { fontWeight: '700' },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.muted, marginTop: 6 },

  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  replyText: { color: COLORS.muted, flex: 1, marginRight: 10 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.black,
  },
  input: {
    flex: 1, color: COLORS.white, maxHeight: 100, fontSize: 15,
    backgroundColor: COLORS.surface, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  send: { color: COLORS.lavender, fontWeight: '700', fontSize: 15 },
});