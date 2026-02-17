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

  test('creates DB lazily on first use', () => {
    const mem = new TeamMemory(dbPath);
    expect(mem.recent(1)).toEqual([]);
  });
});
