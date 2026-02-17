import { Database } from 'bun:sqlite';
import type { Statement } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Memory } from '../shared/types';

export type { Memory };
export class TeamMemory {
  private db: Database;
  private stmtInsert: Statement;
  private stmtRecent: Statement;
  private stmtDelete: Statement;
  private stmtGet: Statement;
  private stmtUpdate: Statement;

  constructor(sqlitePath: string) {
    mkdirSync(join(sqlitePath, '..'), { recursive: true });
    this.db = new Database(sqlitePath);
    this.migrate();
    this.stmtInsert = this.db.prepare(
      `INSERT INTO memories (id, agent_id, type, content, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtRecent = this.db.prepare(
      `SELECT id, agent_id as agentId, type, content, tags,
              created_at as createdAt, updated_at as updatedAt
       FROM memories ORDER BY created_at DESC, rowid DESC LIMIT ?`
    );
    this.stmtDelete = this.db.prepare(`DELETE FROM memories WHERE id = ?`);
    this.stmtGet = this.db.prepare(
      `SELECT id, agent_id as agentId, type, content, tags,
              created_at as createdAt, updated_at as updatedAt
       FROM memories WHERE id = ?`
    );
    this.stmtUpdate = this.db.prepare(
      `UPDATE memories SET type = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?`
    );
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, tags,
        content='memories',
        content_rowid='rowid',
        tokenize='porter'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.rowid, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.rowid, old.content, old.tags);
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END;
    `);
  }

  save(agentId: string, type: string, content: string, tags = ''): string {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsert.run(id, agentId, type, content, tags, now, now);
    return id;
  }

  get(id: string): Memory | null {
    const row = this.stmtGet.get(id) as Memory | undefined;
    return row ?? null;
  }

  update(id: string, payload: { type?: string; content?: string; tags?: string }): boolean {
    const existing = this.get(id);
    if (!existing) return false;
    const type = payload.type ?? existing.type;
    const content = payload.content ?? existing.content;
    const tags = payload.tags ?? existing.tags;
    const updatedAt = Date.now();
    this.stmtUpdate.run(type, content, tags, updatedAt, id);
    return true;
  }

  search(query: string, opts: { type?: string; limit?: number } = {}): Memory[] {
    const limit = opts.limit ?? 10;
    if (opts.type) {
      return this.db.prepare(
        `SELECT m.id, m.agent_id as agentId, m.type, m.content, m.tags,
                m.created_at as createdAt, m.updated_at as updatedAt
         FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ? AND m.type = ?
         LIMIT ?`
      ).all(query, opts.type, limit) as Memory[];
    }
    return this.db.prepare(
      `SELECT m.id, m.agent_id as agentId, m.type, m.content, m.tags,
              m.created_at as createdAt, m.updated_at as updatedAt
       FROM memories_fts f
       JOIN memories m ON m.rowid = f.rowid
       WHERE memories_fts MATCH ?
       LIMIT ?`
    ).all(query, limit) as Memory[];
  }

  recent(limit: number): Memory[] {
    return this.stmtRecent.all(limit) as Memory[];
  }

  delete(id: string): void {
    this.stmtDelete.run(id);
  }

  deleteAll(): number {
    const result = this.db.prepare('DELETE FROM memories').run();
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
