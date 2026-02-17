import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TeamMemory } from '../src/core/team-memory';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), 'tmp-test-memory');
const dbPath = join(tmpDir, 'memory.sqlite');

beforeEach(() => { mkdirSync(tmpDir, { recursive: true }); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('TeamMemory', () => {
  test('saves and retrieves a memory', () => {
    const mem = new TeamMemory(dbPath);
    const id = mem.save('swe-1', 'lesson', 'GitHub rate limit is 5000/hr', 'api,github');
    expect(id).toBeTruthy();
    const recent = mem.recent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].agentId).toBe('swe-1');
    expect(recent[0].type).toBe('lesson');
    expect(recent[0].content).toBe('GitHub rate limit is 5000/hr');
    expect(recent[0].tags).toBe('api,github');
  });

  test('search returns FTS5 matches', () => {
    const mem = new TeamMemory(dbPath);
    mem.save('swe-1', 'lesson', 'GitHub rate limit is 5000/hr', 'api,github');
    mem.save('swe-1', 'fact', 'Fly.io requires --ha for multi-region', 'infra,fly');
    const results = mem.search('rate limit');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('rate limit');
  });

  test('search filters by type', () => {
    const mem = new TeamMemory(dbPath);
    mem.save('swe-1', 'lesson', 'always use feature branches', 'git');
    mem.save('swe-1', 'decision', 'use feature branches not trunk', 'git');
    const decisions = mem.search('feature branches', { type: 'decision' });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].type).toBe('decision');
  });

  test('recent returns newest first', () => {
    const mem = new TeamMemory(dbPath);
    mem.save('swe-1', 'fact', 'first', '');
    mem.save('swe-1', 'fact', 'second', '');
    const recent = mem.recent(2);
    expect(recent[0].content).toBe('second');
    expect(recent[1].content).toBe('first');
  });

  test('delete removes a memory', () => {
    const mem = new TeamMemory(dbPath);
    const id = mem.save('swe-1', 'fact', 'to delete', '');
    mem.delete(id);
    expect(mem.recent(10)).toHaveLength(0);
  });

  test('returns empty array for fresh database', () => {
    const mem = new TeamMemory(dbPath);
    expect(mem.recent(1)).toEqual([]);
  });

  test('get returns memory by id', () => {
    const mem = new TeamMemory(dbPath);
    const id = mem.save('swe-1', 'decision', 'Use Postgres for persistence', 'db');
    const m = mem.get(id);
    expect(m).not.toBeNull();
    expect(m!.id).toBe(id);
    expect(m!.type).toBe('decision');
    expect(m!.content).toBe('Use Postgres for persistence');
    expect(mem.get('no-such-id')).toBeNull();
  });

  test('update modifies memory', () => {
    const mem = new TeamMemory(dbPath);
    const id = mem.save('swe-1', 'lesson', 'Original content', 'old');
    expect(mem.update(id, { content: 'Updated content', tags: 'new' })).toBe(true);
    const m = mem.get(id)!;
    expect(m.content).toBe('Updated content');
    expect(m.tags).toBe('new');
    expect(m.type).toBe('lesson');
    expect(mem.update('no-such-id', { content: 'x' })).toBe(false);
  });

  test('deleteAll removes all memories', () => {
    const mem = new TeamMemory(dbPath);
    mem.save('swe-1', 'fact', 'one', '');
    mem.save('swe-1', 'fact', 'two', '');
    const count = mem.deleteAll();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(mem.recent(10)).toHaveLength(0);
  });
});
