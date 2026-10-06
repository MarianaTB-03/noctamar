import { FullProfile, GridPost } from '../domain/profile';
import {
    Connection, ConnectionKind, FollowRequest, Relation, SearchResult, UserProfileData,
} from '../domain/social';
import { supabase } from './supabase';

async function uidOrThrow(): Promise<string> {
  const { data } = await supabase.auth.getSession(); // sesión local, sin red
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sin sesión');
  return uid;
}

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, is_private';

// ---------- Búsqueda ----------

export async function searchProfiles(query: string): Promise<SearchResult[]> {
  const uid = await uidOrThrow();
  // Quitamos % y _ para que el usuario no pueda inyectar comodines en el ilike
  const q = query.trim().replace(/[%_]/g, '');
  if (!q) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_private')
    .ilike('username', `%${q}%`)
    .neq('id', uid)
    .order('username')
    .limit(30);
  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

// ---------- Perfil de otro usuario ----------

/** Devuelve null si el perfil no existe (o no es visible), en vez de lanzar PGRST116. */
export async function fetchUserProfile(targetId: string): Promise<UserProfileData | null> {
  const uid = await uidOrThrow();

  const [profileRes, statsRes, relRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', targetId).maybeSingle(),
    // RPC con security definer: los contadores se ven aunque la cuenta sea privada (como en Instagram)
    supabase.rpc('profile_stats', { target: targetId }),
    supabase
      .from('follows').select('status')
      .eq('follower_id', uid).eq('following_id', targetId)
      .maybeSingle(),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) {
    console.warn('profile not found for id:', targetId);
    return null;
  }
  const profile = profileRes.data as FullProfile;
  const relation: Relation = (relRes.data?.status as Relation) ?? 'none';
  const isMe = uid === targetId;
  const canView = isMe || !profile.is_private || relation === 'accepted';

  const s: any = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
  const stats = {
    postCount: Number(s?.post_count ?? 0),
    followerCount: Number(s?.follower_count ?? 0),
    followingCount: Number(s?.following_count ?? 0),
  };

  let posts: GridPost[] = [];
  if (canView) {
    const { data: rows } = await supabase
      .from('posts').select('id, image_path')
      .eq('author_id', targetId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (rows?.length) {
      const { data: signed } = await supabase.storage
        .from('media')
        .createSignedUrls(rows.map((r) => r.image_path), 60 * 60);
      const urlByPath = new Map<string, string>();
      signed?.forEach((x) => { if (x.path && x.signedUrl) urlByPath.set(x.path, x.signedUrl); });
      posts = rows.map((r) => ({
        id: r.id,
        imagePath: r.image_path,
        imageUrl: urlByPath.get(r.image_path) ?? '',
      }));
    }
  }

  return { profile, stats, relation, isMe, canView, posts };
}

// ---------- Seguir / dejar de seguir ----------

/**
 * Crea la relación. El servidor decide el estado (un trigger): 'accepted' si la
 * cuenta es pública, 'pending' si es privada. El cliente no puede saltarse la aprobación.
 */
export async function followUser(targetId: string): Promise<Relation> {
  const uid = await uidOrThrow();
  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: uid, following_id: targetId })
    .select('status')
    .single();
  if (error) {
    if (error.code === '23505') return 'accepted'; // ya existía: idempotente
    throw error;
  }
  return data.status as Relation;
}

/** Sirve para dejar de seguir y también para cancelar una solicitud pendiente. */
export async function unfollowUser(targetId: string) {
  const uid = await uidOrThrow();
  const { error } = await supabase
    .from('follows').delete()
    .eq('follower_id', uid).eq('following_id', targetId);
  if (error) throw error;
}

// ---------- Solicitudes recibidas ----------

export async function fetchPendingCount(): Promise<number> {
  const uid = await uidOrThrow();
  const { count } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', uid).eq('status', 'pending');
  return count ?? 0;
}

export async function fetchRequests(): Promise<FollowRequest[]> {
  const uid = await uidOrThrow();
  const { data, error } = await supabase
    .from('follows')
    .select(
      'follower_id, created_at, ' +
      'follower:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)'
    )
    .eq('following_id', uid).eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    followerId: r.follower_id,
    createdAt: r.created_at,
    user: r.follower,
  }));
}

export async function acceptRequest(followerId: string) {
  const uid = await uidOrThrow();
  const { error } = await supabase
    .from('follows').update({ status: 'accepted' })
    .eq('follower_id', followerId).eq('following_id', uid);
  if (error) throw error;
}

export async function rejectRequest(followerId: string) {
  const uid = await uidOrThrow();
  const { error } = await supabase
    .from('follows').delete()
    .eq('follower_id', followerId).eq('following_id', uid);
  if (error) throw error;
}

// ---------- Listas de seguidores / seguidos ----------

/**
 * La lista la entrega una función del SERVIDOR (profile_connections) que comprueba la
 * privacidad: en una cuenta privada solo la ve su dueño o un seguidor aprobado.
 * Si no hay acceso, el servidor responde con el código 42501.
 */
export async function fetchConnections(
  targetId: string,
  kind: ConnectionKind
): Promise<Connection[]> {
  const { data, error } = await supabase.rpc('profile_connections', { target: targetId, kind });
  if (error) {
    if (error.code === '42501') throw Object.assign(new Error('private_account'), { code: 'private' });
    throw error;
  }
  return (data ?? []) as Connection[];
}