export interface CommentAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null; // null = comentario raíz; si no, es respuesta a otro comentario
  body: string;
  createdAt: string;
  author: CommentAuthor;
  pending?: boolean; // true mientras se envía (UI optimista)
}

/** Un comentario raíz con todas sus respuestas (aplanadas en un solo nivel visual). */
export interface Thread {
  root: Comment;
  replies: Comment[];
}