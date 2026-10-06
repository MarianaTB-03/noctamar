import { Profile } from './types';

export interface Story {
  id: string;
  authorId: string;
  imagePath: string; // clave estable de la caché de imágenes
  imageUrl: string;  // URL firmada
  createdAt: string;
  expiresAt: string;
}

export interface StoryGroup {
  author: Profile;
  stories: Story[]; // de la más antigua a la más reciente
}