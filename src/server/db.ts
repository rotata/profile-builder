/**
 * SQLite persistence via Node's built-in `node:sqlite` (no native addon to
 * compile, so a clean clone runs on any Node >= 22.13).
 *
 * Everything read back from disk is zod-validated: persisted data is a
 * runtime boundary like any other. A corrupt row is logged and skipped rather
 * than crashing the page.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getConfig } from "@/server/config";
import { type ChatMessage, ChatMessageSchema } from "@/shared/contract";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    text       TEXT NOT NULL,
    status     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seq        INTEGER NOT NULL
  );
`;

// Survive Next dev hot reloads without opening a second handle.
const globalForDb = globalThis as unknown as { __profileDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalForDb.__profileDb) return globalForDb.__profileDb;
  const path = getConfig().databasePath;
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  globalForDb.__profileDb = db;
  return db;
}

/** Test hook: drop the cached handle (e.g. after switching DATABASE_PATH). */
export function closeDbForTests() {
  globalForDb.__profileDb?.close();
  globalForDb.__profileDb = undefined;
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function warnCorrupt(table: string, detail: unknown) {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), kind: "db.corrupt_row", table, detail: String(detail) }));
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export const messagesRepo = {
  list(): ChatMessage[] {
    const rows = getDb()
      .prepare("SELECT id, role, text, status, created_at AS createdAt FROM messages ORDER BY seq")
      .all();
    return rows.flatMap((row) => {
      const parsed = ChatMessageSchema.safeParse(row);
      if (parsed.success) return [parsed.data];
      warnCorrupt("messages", parsed.error.message);
      return [];
    });
  },

  insert(message: ChatMessage) {
    getDb()
      .prepare(
        `INSERT INTO messages (id, role, text, status, created_at, seq)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages))`,
      )
      .run(message.id, message.role, message.text, message.status, message.createdAt);
  },

  clear() {
    getDb().exec("DELETE FROM messages");
  },
};
