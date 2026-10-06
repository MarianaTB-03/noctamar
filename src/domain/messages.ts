export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  pending?: boolean; // aún en la cola local, sin confirmar por el servidor
}

export interface InboxItem {
  conversationId: string;
  lastMessageAt: string;
  other: { id: string; username: string; full_name: string | null; avatar_url: string | null };
  lastBody: string;
  lastSender: string;
  unread: number;
}