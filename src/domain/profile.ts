export interface FullProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
}

export interface GridPost {
  id: string;
  imagePath: string; // ruta en Storage: clave estable de la caché de imágenes
  imageUrl: string; // URL firmada (cambia en cada petición)
}

export interface MyProfileData {
  profile: FullProfile;
  postCount: number;
  followerCount: number;
  followingCount: number;
  posts: GridPost[];
}