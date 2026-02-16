import { describe, test, expect, beforeEach } from 'bun:test';
import { WorkQueue, WorkQueueManager } from '../src/core/work-queue';

describe('WorkQueue', () => {
  let queue: WorkQueue;

  beforeEach(() => {
    queue = new WorkQueue('engineering');
  });

  test('push and pull', () => {
    queue.push({ taskId: 't1', title: 'Task 1', description: 'desc', priority: 1 });
    const item = queue.pull('agent-1');
    expect(item).not.toBeNull();
    expect(item!.title).toBe('Task 1');
    expect(item!.status).toBe('claimed');
    expect(item!.claimedBy).toBe('agent-1');
  });

  test('pull returns highest priority first', () => {
    queue.push({ taskId: 't1', title: 'Low', description: '', priority: 10 });
    queue.push({ taskId: 't2', title: 'High', description: '', priority: 1 });
    const item = queue.pull('a');
    expect(item!.title).toBe('High');
  });

  test('pull returns null when empty', () => {
    expect(queue.pull('a')).toBeNull();
  });

  test('complete removes item', () => {
    queue.push({ taskId: 't1', title: 'T', description: '', priority: 1 });
    const item = queue.pull('a')!;
    queue.complete(item.id);
    expect(queue.list()).toHaveLength(0);
  });

  test('block and release', () => {
    queue.push({ taskId: 't1', title: 'T', description: '', priority: 1 });
    const item = queue.pull('a')!;
    queue.block(item.id, 'need help');
    expect(queue.list('blocked')).toHaveLength(1);
    queue.release(item.id);
    expect(queue.list('queued')).toHaveLength(1);
  });
});

describe('WorkQueueManager', () => {
  test('create and list', () => {
    const mgr = new WorkQueueManager();
    mgr.create('eng');
    mgr.create('product');
    expect(mgr.list()).toEqual(['eng', 'product']);
  });
});
