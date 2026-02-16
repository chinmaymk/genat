import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TaskManager } from '../src/core/task-manager';
import { unlink, mkdir } from 'fs/promises';
import { dirname } from 'path';

const TEST_DB = 'data/test-tasks.sqlite';

describe('TaskManager', () => {
  let tm: TaskManager;

  beforeEach(async () => {
    try {
      await unlink(TEST_DB);
    } catch {
      // ignore
    }
    await mkdir(dirname(TEST_DB), { recursive: true });
    tm = new TaskManager(TEST_DB);
    tm.init();
  });

  afterEach(async () => {
    try {
      await unlink(TEST_DB);
    } catch {
      // ignore
    }
  });

  test('create and get task', () => {
    const task = tm.create({ type: 'directive', title: 'Build portal', description: 'A portal', status: 'queued' });
    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Build portal');
    const fetched = tm.get(task.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Build portal');
  });

  test('update task', () => {
    const task = tm.create({ type: 'task', title: 'T', description: '', status: 'queued' });
    const updated = tm.update(task.id, { status: 'in_progress', assignee: 'swe-1' });
    expect(updated.status).toBe('in_progress');
    expect(updated.assignee).toBe('swe-1');
  });

  test('list with filters', () => {
    tm.create({ type: 'directive', title: 'D1', description: '', status: 'queued' });
    tm.create({ type: 'task', title: 'T1', description: '', status: 'queued' });
    tm.create({ type: 'task', title: 'T2', description: '', status: 'done' });
    expect(tm.list({ type: 'task' })).toHaveLength(2);
    expect(tm.list({ status: 'done' })).toHaveLength(1);
  });

  test('auto-complete parent when all children done', () => {
    const parent = tm.create({ type: 'epic', title: 'Epic', description: '', status: 'in_progress' });
    const c1 = tm.create({ type: 'task', title: 'C1', description: '', status: 'queued', parentId: parent.id });
    const c2 = tm.create({ type: 'task', title: 'C2', description: '', status: 'queued', parentId: parent.id });
    tm.update(c1.id, { status: 'done' });
    expect(tm.get(parent.id)!.status).toBe('in_progress');
    tm.update(c2.id, { status: 'done' });
    expect(tm.get(parent.id)!.status).toBe('done');
  });

  test('getChildren', () => {
    const p = tm.create({ type: 'epic', title: 'E', description: '', status: 'queued' });
    tm.create({ type: 'task', title: 'C1', description: '', status: 'queued', parentId: p.id });
    tm.create({ type: 'task', title: 'C2', description: '', status: 'queued', parentId: p.id });
    expect(tm.getChildren(p.id)).toHaveLength(2);
  });
});
