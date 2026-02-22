import { describe, test, expect } from 'bun:test';
import { AsyncWorkQueue } from '../src/core/async-work-queue';

describe('AsyncWorkQueue', () => {
  test('push and pull a single item', async () => {
    const q = new AsyncWorkQueue('engineering');
    q.push({ title: 'fix bug', description: 'details', priority: 0 });
    const item = await q.pull();
    expect(item.title).toBe('fix bug');
  });

  test('pull() resolves when item arrives after await', async () => {
    const q = new AsyncWorkQueue('engineering');
    const p = q.pull();
    q.push({ title: 'late task', description: '', priority: 0 });
    const item = await p;
    expect(item.title).toBe('late task');
  });

  test('higher priority items dequeued first', async () => {
    const q = new AsyncWorkQueue('engineering');
    q.push({ title: 'low', description: '', priority: 10 });
    q.push({ title: 'high', description: '', priority: 1 });
    const first = await q.pull();
    expect(first.title).toBe('high');
  });

  test('only one puller gets each item', async () => {
    const q = new AsyncWorkQueue('engineering');
    const p1 = q.pull();
    const p2 = q.pull();
    q.push({ title: 'task-a', description: '', priority: 0 });
    q.push({ title: 'task-b', description: '', priority: 0 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(new Set([a.title, b.title])).toEqual(new Set(['task-a', 'task-b']));
  });
});
