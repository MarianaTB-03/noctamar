import { Post } from '../domain/types';
import { supabase } from './supabase';

const PAGE_SIZE = 10;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession(); // lee la sesión local, sin red
  return data.session?.user.id ?? null;
}

/**
 * Feed con paginación por cursor (keyset): más estable y rápida que OFFSET
 * cuando se insertan posts nuevos mientras el usuario hace scroll.
 * El feed muestra TODO lo que el usuario tiene permiso de ver: sus propias publicaciones,
 * las de cuentas públicas y las de cuentas privadas que sigue (aceptado). Ese filtro de
 * privacidad lo aplica el SERVIDOR (RLS con can_view), no la app: aunque aquí no se filtre
 * por autor, una cuenta privada que no sigues nunca llega.
 */
export async function fetchFeed(cursor?: string): Promise<Post[]> {
  const uid = await currentUserId();
  if (!uid) return [];

  let query = supabase
    .from('posts')
    .select(
      `id, caption, image_path, created_at,
       author:profiles!posts_author_id_fkey(id, username, avatar_url),
       likes(count), comments(count)`
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) query = query.lt('created_at', cursor);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map((r: any) => r.id);
  const paths = rows.map((r: any) => r.image_path);

  // Una sola consulta para saber cuáles posts de la página ya tienen mi like
  const { data: mine } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', uid)
    .in('post_id', ids);
  const likedSet = new Set((mine ?? []).map((l) => l.post_id));

  // Relación con cada autor de la página (una sola consulta) para mostrar "Seguir" si hace falta
  const authorIds = Array.from(new Set(rows.map((r: any) => r.author.id as string)));
  const { data: rels } = await supabase
    .from('follows')
    .select('following_id, status')
    .eq('follower_id', uid)
    .in('following_id', authorIds);
  const relByAuthor = new Map((rels ?? []).map((f: any) => [f.following_id, f.status]));

  // Una sola llamada para firmar todas las URLs de la página
  const { data: signed, error: signError } = await supabase.storage
    .from('media')
    .createSignedUrls(paths, 60 * 60);
  if (signError) console.warn('signed url error:', signError.message);
  signed?.forEach((s) => {
    if (s.error) console.warn('sign fail:', s.path, s.error);
  });
  const urlByPath = new Map(
    (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
  );

  return rows.map((r: any) => ({
    id: r.id,
    caption: r.caption,
    imagePath: r.image_path,
    imageUrl: urlByPath.get(r.image_path) ?? '',
    createdAt: r.created_at,
    author: r.author,
    likeCount: r.likes?.[0]?.count ?? 0,
    commentCount: r.comments?.[0]?.count ?? 0,
    likedByMe: likedSet.has(r.id),
    authorRelation: r.author.id === uid ? 'me' : ((relByAuthor.get(r.author.id) as any) ?? 'none'),
  }));
}

export async function setLike(postId: string, like: boolean) {
  const uid = await currentUserId();
  if (!uid) throw new Error('Sin sesión');
  if (like) {
    // upsert + PK compuesta => idempotente (reintentos de la cola offline)
    const { error } = await supabase
      .from('likes')
      .upsert({ post_id: postId, user_id: uid }, { ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

const POST_SELECT = `id, caption, image_path, created_at,
       author:profiles!posts_author_id_fkey(id, username, avatar_url),
       likes(count), comments(count)`;

/**
 * Una sola publicación por id (detalle y enlaces compartidos).
 * Devuelve null si no existe O si la regla de privacidad del servidor (RLS) no deja verla:
 * el cliente no distingue ambos casos, y así no se filtra que el post existe.
 */
export async function fetchPostById(id: string): Promise<Post | null> {
  const uid = await currentUserId();
  if (!uid) return null;

  const { data: r, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!r) return null;
  const row: any = r;

  const [likeRes, signRes] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', uid).eq('post_id', id).maybeSingle(),
    supabase.storage.from('media').createSignedUrl(row.image_path, 60 * 60),
  ]);

  return {
    id: row.id,
    caption: row.caption,
    imagePath: row.image_path,
    imageUrl: signRes.data?.signedUrl ?? '',
    createdAt: row.created_at,
    author: row.author,
    likeCount: row.likes?.[0]?.count ?? 0,
    commentCount: row.comments?.[0]?.count ?? 0,
    likedByMe: !!likeRes.data,
  };
}