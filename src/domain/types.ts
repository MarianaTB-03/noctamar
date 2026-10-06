export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface Post {
  id: string;
  caption: string | null;
  imagePath: string;      // clave estable en Storage (NO la URL firmada)
  imageUrl: string;       // URL firmada, cambia en cada petición
  createdAt: string;
  author: Profile;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** Relación con el autor: solo el feed la rellena (para mostrar el botón Seguir). */
  authorRelation?: 'me' | 'none' | 'pending' | 'accepted';
}