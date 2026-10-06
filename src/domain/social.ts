import { FullProfile, GridPost } from './profile';

/** Relación del usuario actual con otro perfil. */
export type Relation = 'none' | 'pending' | 'accepted';

export interface ProfileStats {
  postCount: number;
  followerCount: number;
  followingCount: number;
}

export interface UserProfileData {
  profile: FullProfile;
  stats: ProfileStats;
  relation: Relation;
  isMe: boolean;
  canView: boolean; // puede ver sus publicaciones (cuenta pública, propia o seguida y aceptada)
  posts: GridPost[];
}

export interface PersonLite {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface SearchResult extends PersonLite {
  is_private: boolean;
}

export interface FollowRequest {
  followerId: string;
  createdAt: string;
  user: PersonLite;
}

export type ConnectionKind = 'followers' | 'following';

/** Fila de una lista de seguidores/seguidos, con MI relación hacia esa persona. */
export interface Connection extends SearchResult {
  relation: Relation;
}