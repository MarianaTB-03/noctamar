import { Comment, CommentAuthor } from '../domain/comments';
import { supabase } from './supabase';

const SELECT =
  'id, post_id, parent_id, body, created_at, ' +
  'author:profiles!comments_user_id_fkey(id, username, avatar_url)';

function mapRow(r: any): Comment {
  return {
    id: r.id,
    postId: r.post_id,
    parentId: r.parent_id,
    body: r.body,
    createdAt: r.created_at,
    author: r.author,
  };
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/**
 * El id lo genera el CLIENTE: así la pantalla puede mostrar el comentario al instante
 * (UI optimista) y el eco que llega por Realtime se reconoce y no se duplica.
 */
export async function addComment(input: {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  body: string;
}) {
  const { error } = await supabase.from('comments').insert({
    id: input.id,
    post_id: input.postId,
    user_id: input.userId,
    parent_id: input.parentId,
    body: input.body,
  });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAuthor(id: string): Promise<CommentAuthor | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', id)
    .maybeSingle();
  return (data as CommentAuthor) ?? null;
}

interface Handlers {
  onInsert: (row: { id: string; user_id: string; parent_id: string | null; body: string; created_at: string; post_id: string }) => void;
  onDelete: (id: string) => void;
}

/** Suscripción Realtime a los comentarios de UN post. Devuelve la función para cancelarla. */
export function subscribeToComments(postId: string, h: Handlers): () => void {
  const channel = supabase
    .channel(`comments:${postId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
      (payload) => h.onInsert(payload.new as any)
    )
    // Los DELETE no admiten filtro: solo llega el id; la pantalla ignora los que no son suyos
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'comments' },
      (payload) => {
        const id = (payload.old as any)?.id;
        if (id) h.onDelete(id);
      }
    )
    .subscribe();

  // Importante: cerrar el canal al salir evita fugas de conexión y memoria
  return () => { supabase.removeChannel(channel); };
}