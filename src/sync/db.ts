import * as SQLite from 'expo-sqlite';

/**
 * Base de datos embebida (SQLite) con la COLA DE SALIDA ("outbox").
 *
 * seq INTEGER PRIMARY KEY AUTOINCREMENT es el que garantiza el ORDEN CRONOLÓGICO:
 * SQLite asigna números siempre crecientes y nunca reutiliza uno ya usado, así que
 * ordenar por seq equivale a ordenar por el momento en que el usuario hizo la acción,
 * incluso si la app se cierra y se reabre días después.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('noctamar.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS outbox (
          seq        INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    TEXT    NOT NULL,
          type       TEXT    NOT NULL,   -- 'like' | 'comment_add' | 'comment_delete'
          entity_id  TEXT    NOT NULL,   -- post (like) o comentario (add/delete): sirve para fusionar acciones
          payload    TEXT    NOT NULL,   -- JSON con los datos de la acción
          created_at INTEGER NOT NULL,
          attempts   INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS outbox_user_seq ON outbox (user_id, seq);
      `);
      return db;
    })();
  }
  return dbPromise;
}