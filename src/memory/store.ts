import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface Memory {
  id: string;
  agentId: string;
  content: string;
  type: 'lesson' | 'decision' | 'fact';
  createdAt: number;
}

interface MemoryRow {
  id: string;
  agent_id: string;
  content: string;
  type: string;
  created_at: number;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    type: row.type as Memory['type'],
    createdAt: row.created_at,
  };
}

export class MemoryStore {
  private db: Database;

  constructor(dbPath: string = 'data/memory.sqlite') {
    this.db = new Database(dbPath);
    this.init();
  }

  init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT NOT NULL,
        content    TEXT NOT NULL,
        type       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)');

    // FTS5 virtual table
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='rowid'
      )
    `);
  }

  store(agentId: string, content: string, type: Memory['type'], _source?: 'user' | 'agent'): Memory {
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    this.db.prepare(
      'INSERT INTO memories (id, agent_id, content, type, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, agentId, content, type, createdAt);

    // Manually sync FTS
    const row = this.db.prepare('SELECT rowid FROM memories WHERE id = ?').get(id) as { rowid: number } | null;
    if (row) {
      this.db.prepare('INSERT INTO memories_fts(rowid, content) VALUES (?, ?)').run(row.rowid, content);
    }

    return { id, agentId, content, type, createdAt };
  }

  search(agentId: string, query: string, limit: number = 10): Memory[] {
    const safeQuery = query.replace(/['"*\-]/g, ' ').trim();
    if (!safeQuery) return this.getRecent(agentId, limit);

    try {
      const rows = this.db.prepare(`
        SELECT m.id, m.agent_id, m.content, m.type, m.created_at
        FROM memories m
        JOIN memories_fts fts ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ? AND m.agent_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(safeQuery, agentId, limit) as MemoryRow[];

      return rows.map(rowToMemory);
    } catch {
      // Fallback to LIKE search
      const rows = this.db.prepare(`
        SELECT * FROM memories
        WHERE agent_id = ? AND content LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(agentId, `%${query}%`, limit) as MemoryRow[];

      return rows.map(rowToMemory);
    }
  }

  getRecent(agentId: string, limit: number = 20): Memory[] {
    const rows = this.db.prepare(
      'SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(agentId, limit) as MemoryRow[];

    return rows.map(rowToMemory);
  }
}

/** Shared interface for MemoryStore and LayeredMemoryStore. */
export interface IMemoryStore {
  init(): void;
  store(agentId: string, content: string, type: Memory['type'], source?: 'user' | 'agent'): Memory;
  search(agentId: string, query: string, limit?: number): Memory[];
  getRecent(agentId: string, limit?: number): Memory[];
}

let _memoryStore: IMemoryStore | null = null;

export async function getMemoryStore(): Promise<IMemoryStore> {
  if (!_memoryStore) {
    const dbPath = 'data/memory.sqlite';
    await mkdir(dirname(dbPath), { recursive: true });
    _memoryStore = new MemoryStore(dbPath);
  }
  return _memoryStore;
}

export function setMemoryStore(store: IMemoryStore): void {
  _memoryStore = store;
}
