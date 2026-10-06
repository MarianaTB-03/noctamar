import { Post } from '../domain/types';
import { pendingLikes } from './outbox';

/**
 * Pinta encima de los datos del servidor lo que el usuario ya hizo pero aún no se sincronizó.
 * Sin esto, al recargar el feed estando offline (o antes de que termine la cola) el corazón
 * "volvería" al estado viejo del servidor y el usuario creería que su like se perdió.
 */
export async function applyPendingLikes(userId: string, posts: Post[]): Promise<Post[]> {
  const pending = await pendingLikes(userId);
  if (pending.size === 0) return posts;
  return posts.map((p) => {
    const want = pending.get(p.id);
    if (want === undefined || want === p.likedByMe) return p;
    return { ...p, likedByMe: want, likeCount: Math.max(0, p.likeCount + (want ? 1 : -1)) };
  });
}