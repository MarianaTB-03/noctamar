import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FullProfile, GridPost, MyProfileData } from '../domain/profile';
import { supabase } from './supabase';

const AVATAR_SIZE = 400;
const GRID_LIMIT = 60; // la paginación del grid llega con el Módulo 2 (rendimiento)

async function uidOrThrow(): Promise<string> {
  const { data } = await supabase.auth.getSession(); // sesión local, sin red
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sin sesión');
  return uid;
}

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, is_private';

/** Solo la fila del perfil (la usa la pantalla de edición). */
export async function fetchOwnProfile(): Promise<FullProfile> {
  const uid = await uidOrThrow();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', uid)
    .single();
  if (error) throw error;
  return data as FullProfile;
}

/** Perfil + contadores + mis publicaciones. Las 5 consultas corren en paralelo. */
export async function fetchMyProfile(): Promise<MyProfileData> {
  const uid = await uidOrThrow();

  const [profileRes, postCountRes, followersRes, followingRes, postsRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).single(),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', uid),
    supabase
      .from('follows').select('follower_id', { count: 'exact', head: true })
      .eq('following_id', uid).eq('status', 'accepted'),
    supabase
      .from('follows').select('following_id', { count: 'exact', head: true })
      .eq('follower_id', uid).eq('status', 'accepted'),
    supabase
      .from('posts').select('id, image_path')
      .eq('author_id', uid)
      .order('created_at', { ascending: false })
      .limit(GRID_LIMIT),
  ]);

  if (profileRes.error) throw profileRes.error;
  const rows = postsRes.data ?? [];

  // Una sola llamada para firmar todas las miniaturas
  const urlByPath = new Map<string, string>();
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from('media')
      .createSignedUrls(rows.map((r) => r.image_path), 60 * 60);
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });
  }

  const posts: GridPost[] = rows.map((r) => ({
    id: r.id,
    imagePath: r.image_path,
    imageUrl: urlByPath.get(r.image_path) ?? '',
  }));

  return {
    profile: profileRes.data as FullProfile,
    postCount: postCountRes.count ?? 0,
    followerCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    posts,
  };
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const uid = await uidOrThrow();
  const { data } = await supabase
    .from('profiles').select('id')
    .eq('username', username).neq('id', uid)
    .maybeSingle();
  return !!data;
}

export async function updateProfile(
  patch: Partial<Pick<FullProfile, 'username' | 'full_name' | 'bio' | 'is_private' | 'avatar_url'>>
) {
  const uid = await uidOrThrow();
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) {
    if (error.code === '23505') throw new Error('Ese nombre de usuario ya está en uso.');
    throw error;
  }
}

/**
 * Sube el avatar al bucket PÚBLICO "avatars" (como en Instagram, la foto de perfil
 * se ve aunque la cuenta sea privada) y devuelve la URL pública.
 */
export async function uploadAvatar(uri: string, width: number): Promise<string> {
  const uid = await uidOrThrow();

  const ctx = ImageManipulator.manipulate(uri);
  if (width > AVATAR_SIZE) ctx.resize({ width: AVATAR_SIZE });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!out.base64) throw new Error('No se pudo procesar la imagen.');

  const bytes = decode(out.base64);
  if (bytes.byteLength === 0) throw new Error('La imagen quedó vacía.');

  const path = `${uid}/avatar.jpg`; // siempre el mismo archivo: reemplaza al anterior
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // ?v= rompe la caché: la URL es la misma aunque cambie la foto
  return `${data.publicUrl}?v=${Date.now()}`;
}