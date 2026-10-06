import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

const MAX_WIDTH = 1080; // ancho máximo: suficiente para un teléfono y mucho más liviano

export interface NewPost {
  uri: string;      // imagen local elegida de la galería
  width: number;    // ancho original (lo da el picker)
  caption: string;
}

/**
 * Reduce el tamaño, recomprime a JPEG y devuelve el contenido en base64.
 * Pedimos el base64 directamente al manipulador: así no dependemos de
 * leer el archivo con fetch(file://), que en algunos dispositivos entrega bytes vacíos.
 */
export async function compress(uri: string, width: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  if (!out.base64) throw new Error('No se pudo procesar la imagen.');
  return out.base64;
}

/**
 * Publica un post: comprime -> sube a Storage -> inserta la fila.
 * El id lo genera el cliente (uuid), así el mismo post se puede reintentar sin duplicarse
 * (lo reutilizaremos en la cola offline del Módulo 3).
 */
export async function publishPost({ uri, width, caption }: NewPost): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sin sesión');

  const postId = Crypto.randomUUID();
  const path = `${uid}/${postId}.jpg`; // la carpeta = id del dueño (lo exige la política de Storage)

  const base64 = await compress(uri, width);
  const bytes = decode(base64); // base64 -> ArrayBuffer
  if (bytes.byteLength === 0) throw new Error('La imagen quedó vacía.');

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('posts').insert({
    id: postId,
    author_id: uid,
    image_path: path,
    caption: caption.trim() || null,
  });
  if (insertError) {
    // Si falla la fila, no dejamos la imagen huérfana en Storage
    await supabase.storage.from('media').remove([path]);
    throw insertError;
  }
  return postId;
}