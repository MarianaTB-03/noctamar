import { getDb } from './db';

export type ActionType = 'like' | 'comment_add' | 'comment_delete' | 'message_send';

export interface OutboxRow {
  seq: number;
  user_id: string;
  type: ActionType;
  entity_id: string;
  payload: string;
  created_at: number;
  attempts: number;
}

export interface CommentPayload {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
}

/** Cuántas acciones hay pendientes (se avisa a la UI con el callback registrado). */
let onChange: (() => void) | null = null;
export function setOutboxListener(fn: () => void) { onChange = fn; }
const notify = () => onChange?.();

/**
 * Like: FUSIÓN de acciones. Si el usuario toca el corazón 5 veces sin conexión, solo importa
 * el último estado deseado. Se descartan los "like" pendientes del mismo post y se guarda uno
 * solo (último que gana). Así no se mandan 5 peticiones y el resultado es el mismo.
 */
export async function enqueueLike(userId: string, postId: string, liked: boolean) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM outbox WHERE user_id = ? AND type = 'like' AND entity_id = ?`,
      [userId, postId]
    );
    await db.runAsync(
      `INSERT INTO outbox (user_id, type, entity_id, payload, created_at) VALUES (?, 'like', ?, ?, ?)`,
      [userId, postId, JSON.stringify({ postId, liked }), Date.now()]
    );
  });
  notify();
}

export async function enqueueCommentAdd(userId: string, c: CommentPayload) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (user_id, type, entity_id, payload, created_at) VALUES (?, 'comment_add', ?, ?, ?)`,
    [userId, c.id, JSON.stringify(c), Date.now()]
  );
  notify();
}

/**
 * Borrar un comentario que AÚN no se ha enviado: no hay nada que borrar en el servidor,
 * basta con quitar el "comment_add" de la cola (las dos acciones se anulan).
 * Devuelve true si se canceló localmente.
 */
export async function enqueueCommentDelete(
  userId: string, commentId: string, isInFlight: (seq: number) => boolean
): Promise<boolean> {
  const db = await getDb();
  const pendingAdd = await db.getFirstAsync<{ seq: number }>(
    `SELECT seq FROM outbox WHERE user_id = ? AND type = 'comment_add' AND entity_id = ?`,
    [userId, commentId]
  );
  if (pendingAdd && !isInFlight(pendingAdd.seq)) {
    await db.runAsync(`DELETE FROM outbox WHERE seq = ?`, [pendingAdd.seq]);
    notify();
    return true;
  }
  await db.runAsync(
    `INSERT INTO outbox (user_id, type, entity_id, payload, created_at) VALUES (?, 'comment_delete', ?, ?, ?)`,
    [userId, commentId, JSON.stringify({ id: commentId }), Date.now()]
  );
  notify();
  return false;
}

export interface MessagePayload { id: string; conversationId: string; body: string }

/** Mensaje directo: entra a la misma cola cronológica, así que también funciona sin conexión. */
export async function enqueueMessage(userId: string, m: MessagePayload) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (user_id, type, entity_id, payload, created_at) VALUES (?, 'message_send', ?, ?, ?)`,
    [userId, m.id, JSON.stringify(m), Date.now()]
  );
  notify();
}

/** Mensajes de una conversación que aún no salieron (se muestran con "Enviando…"). */
export async function pendingMessages(userId: string, conversationId: string): Promise<MessagePayload[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox WHERE user_id = ? AND type = 'message_send' ORDER BY seq ASC`, [userId]
  );
  return rows.map((r) => JSON.parse(r.payload) as MessagePayload).filter((m) => m.conversationId === conversationId);
}

/** La acción más antigua pendiente del usuario (FIFO por seq). */
export async function peekOldest(userId: string): Promise<OutboxRow | null> {
  const db = await getDb();
  return (await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE user_id = ? ORDER BY seq ASC LIMIT 1`, [userId]
  )) ?? null;
}

export async function removeRow(seq: number) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM outbox WHERE seq = ?`, [seq]);
  notify();
}

export async function bumpAttempts(seq: number): Promise<number> {
  const db = await getDb();
  await db.runAsync(`UPDATE outbox SET attempts = attempts + 1 WHERE seq = ?`, [seq]);
  const row = await db.getFirstAsync<{ attempts: number }>(`SELECT attempts FROM outbox WHERE seq = ?`, [seq]);
  return row?.attempts ?? 0;
}

export async function countPending(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE user_id = ?`, [userId]
  );
  return row?.n ?? 0;
}

// ---------- Lecturas para pintar el estado optimista sobre datos del servidor ----------

/** postId -> estado de like que el usuario pidió y aún no llegó al servidor. */
export async function pendingLikes(userId: string): Promise<Map<string, boolean>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox WHERE user_id = ? AND type = 'like' ORDER BY seq ASC`, [userId]
  );
  const map = new Map<string, boolean>();
  rows.forEach((r) => { const p = JSON.parse(r.payload); map.set(p.postId, p.liked); });
  return map;
}

/** Comentarios de un post que aún no se han enviado (se muestran con "Enviando…"). */
export async function pendingComments(userId: string, postId: string): Promise<CommentPayload[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox WHERE user_id = ? AND type = 'comment_add' ORDER BY seq ASC`, [userId]
  );
  return rows.map((r) => JSON.parse(r.payload) as CommentPayload).filter((c) => c.postId === postId);
}

/** ids de comentarios con borrado pendiente (hay que ocultarlos aunque el servidor aún los devuelva). */
export async function pendingDeletes(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ entity_id: string }>(
    `SELECT entity_id FROM outbox WHERE user_id = ? AND type = 'comment_delete'`, [userId]
  );
  return new Set(rows.map((r) => r.entity_id));
}