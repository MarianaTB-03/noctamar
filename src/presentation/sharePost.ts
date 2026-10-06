import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import { BRAND } from '../constants/brand';
import { Post } from '../domain/types';

/**
 * Enlace profundo a un post. Linking.createURL adapta el formato al entorno:
 *  - app compilada:  noctamar://post/{uuid}   (usa el "scheme" de app.json)
 *  - Expo Go:        exp://192.168.x.x:8081/--/post/{uuid}
 * En el Módulo 5 la app interceptará este enlace y abrirá directamente el detalle.
 */
export function postLink(postId: string): string {
  return Linking.createURL(`post/${postId}`);
}

/** Abre el menú de compartir del sistema con el enlace al post. */
export async function sharePost(post: Post): Promise<void> {
  const url = postLink(post.id);
  const text = `Mira la publicación de @${post.author.username} en ${BRAND.name}`;
  try {
    // En iOS el enlace va en su propio campo; en Android solo existe "message"
    await Share.share(
      Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` }
    );
  } catch (e) {
    console.warn('share error', e);
  }
}