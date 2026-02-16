import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../logger';

export type TaskType = 'directive' | 'epic' | 'story' | 'task';
export type TaskStatus = 'queued' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface Task {
  id: string;
  parentId?: string;
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

interface TaskRow {
  id: string;
  parent_id: string | null;
  type: string;
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

function rowToTask(row: TaskRow): Task {
  const task: Task = {
    id: row.id,
    type: row.type as TaskType,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.parent_id) task.parentId = row.parent_id;
  if (row.assignee) task.assignee = row.assignee;
  if (row.metadata) {
    try {
      task.metadata = JSON.parse(row.metadata);
    } catch {
      // ignore malformed metadata
    }
  }
  return task;
}

export class TaskManager {
  private db: Database;

  constructor(dbPath: string = 'data/tasks.sqlite') {
    this.db = new Database(dbPath);
  }

  init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'queued',
        assignee    TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        metadata    TEXT,
        FOREIGN KEY (parent_id) REFERENCES tasks(id)
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)');
    logger.info('Task manager initialized');
  }

  create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, source?: 'user' | 'agent'): Task {
    const now = Date.now();
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO tasks (id, parent_id, type, title, description, status, assignee, created_at, updated_at, metadata)
      VALUES ($id, $parentId, $type, $title, $description, $status, $assignee, $createdAt, $updatedAt, $metadata)
    `).run({
      $id: id,
      $parentId: task.parentId ?? null,
      $type: task.type,
      $title: task.title,
      $description: task.description,
      $status: task.status ?? 'queued',
      $assignee: task.assignee ?? null,
      $createdAt: now,
      $updatedAt: now,
      $metadata: task.metadata ? JSON.stringify(task.metadata) : null,
    });

    return this.get(id)!;
  }

  update(id: string, updates: Partial<Task>): Task {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Task "${id}" not found`);
    }

    const now = Date.now();
    this.db.prepare(`
      UPDATE tasks SET
        parent_id   = $parentId,
        type        = $type,
        title       = $title,
        description = $description,
        status      = $status,
        assignee    = $assignee,
        updated_at  = $updatedAt,
        metadata    = $metadata
      WHERE id = $id
    `).run({
      $id: id,
      $parentId: updates.parentId ?? existing.parentId ?? null,
      $type: updates.type ?? existing.type,
      $title: updates.title ?? existing.title,
      $description: updates.description ?? existing.description,
      $status: updates.status ?? existing.status,
      $assignee: updates.assignee ?? existing.assignee ?? null,
      $updatedAt: now,
      $metadata:
        updates.metadata !== undefined
          ? JSON.stringify(updates.metadata)
          : existing.metadata
          ? JSON.stringify(existing.metadata)
          : null,
    });

    if (updates.status === 'done' && existing.parentId) {
      this.checkAutoComplete(existing.parentId);
    }

    return this.get(id)!;
  }

  get(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | null;
    return row ? rowToTask(row) : null;
  }

  getChildren(parentId: string): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC')
      .all(parentId) as TaskRow[];
    return rows.map(rowToTask);
  }

  getByStatus(status: TaskStatus): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC')
      .all(status) as TaskRow[];
    return rows.map(rowToTask);
  }

  getByAssignee(assignee: string): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE assignee = ? ORDER BY created_at ASC')
      .all(assignee) as TaskRow[];
    return rows.map(rowToTask);
  }

  list(filter?: { type?: TaskType; status?: TaskStatus; parentId?: string }): Task[] {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filter?.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.parentId) {
      conditions.push('parent_id = ?');
      params.push(filter.parentId);
    }

    const query = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    const rows = this.db.prepare(query).all(...params) as TaskRow[];
    return rows.map(rowToTask);
  }

  checkAutoComplete(parentId: string): void {
    const children = this.getChildren(parentId);
    if (children.length === 0) return;

    const allDone = children.every(c => c.status === 'done');
    if (allDone) {
      const parent = this.get(parentId);
      if (parent && parent.status !== 'done') {
        const now = Date.now();
        this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run('done', now, parentId);
        if (parent.parentId) {
          this.checkAutoComplete(parent.parentId);
        }
      }
    }
  }
}

/** Shared interface for TaskManager and LayeredTaskManager. */
export interface ITaskManager {
  init(): void;
  create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, source?: 'user' | 'agent'): Task;
  update(id: string, updates: Partial<Task>): Task;
  get(id: string): Task | null;
  getChildren(parentId: string): Task[];
  getByStatus(status: TaskStatus): Task[];
  getByAssignee(assignee: string): Task[];
  list(filter?: { type?: TaskType; status?: TaskStatus; parentId?: string }): Task[];
}

let _taskManager: ITaskManager | null = null;

export async function getTaskManager(): Promise<ITaskManager> {
  if (!_taskManager) {
    const dbPath = 'data/tasks.sqlite';
    await mkdir(dirname(dbPath), { recursive: true });
    const tm = new TaskManager(dbPath);
    tm.init();
    _taskManager = tm;
  }
  return _taskManager;
}

export function setTaskManager(tm: ITaskManager): void {
  _taskManager = tm;
}
