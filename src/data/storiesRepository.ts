import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { Story, StoryGroup } from '../domain/stories';
import { compress } from './postUploader';
import { supabase } from './supabase';

/**
 * Historias vigentes visibles para mí. La vigencia (24 h) y la privacidad las aplica el SERVIDOR
 * con la política RLS de `stories`: expires_at > now() AND can_view(author_id).
 * Una historia vencida simplemente deja de llegar; no hace falta un proceso de limpieza para ocultarla.
 */
export async function fetchStoryGroups(): Promise<StoryGroup[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(`id, image_path, created_at, expires_at,
             author:profiles!stories_author_id_fkey(id, username, avatar_url)`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from('media')
    .createSignedUrls(rows.map((r) => r.image_path), 60 * 60);
  const urlByPath = new Map<string, string>();
  signed?.forEach((s) => { if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl); });

  const groups = new Map<string, StoryGroup>();
  for (const r of rows) {
    const story: Story = {
      id: r.id,
      authorId: r.author.id,
      imagePath: r.image_path,
      imageUrl: urlByPath.get(r.image_path) ?? '',
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };    const g: StoryGroup = groups.get(r.author.id) ?? { author: r.author, stories: [] };
    g.stories.push(story);
    groups.set(r.author.id, g);
  }
  return [...groups.values()];
}

export async function publishStory(uri: string, width: number): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sin sesión');

  const id = Crypto.randomUUID();
  const path = `${uid}/stories/${id}.jpg`; // primera carpeta = dueño (lo exige la política de Storage)

  const bytes = decode(await compress(uri, width));
  if (bytes.byteLength === 0) throw new Error('La imagen quedó vacía.');

  const { error: upErr } = await supabase.storage
    .from('media').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from('stories').insert({ id, author_id: uid, image_path: path });
  if (insErr) {
    await supabase.storage.from('media').remove([path]);
    throw insErr;
  }
}

export async function deleteStory(story: Story): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', story.id);
  if (error) throw error;
  await supabase.storage.from('media').remove([story.imagePath]);
}