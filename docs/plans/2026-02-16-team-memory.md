# Team-Scoped Agent Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-team SQLite memory so agents can persist lessons, decisions, and facts across restarts and share knowledge with teammates.

**Architecture:** Per-team SQLite databases with FTS5 live in `<agentOrgDir>/teams/<teamname>/memory.sqlite`. Each agent resolves its team by matching its role against team member lists in `org/teams/*.md`. Agents get two new tools (`save_memory`, `search_memory`) and 10 recent memories are injected into every message prompt. Directors additionally search the `executive` DB.

**Tech Stack:** `bun:sqlite` (built-in), `bun test`, TypeScript

---

### Task 1: `TeamMemory` class

**Files:**
- Create: `src/core/team-memory.ts`
- Create: `tests/team-memory.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/team-memory.test.ts
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
    // No error thrown even if dir exists but file does not
    const mem = new TeamMemory(dbPath);
    expect(mem.recent(1)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/team-memory.test.ts
```
Expected: FAIL with `Cannot find module '../src/core/team-memory'`

**Step 3: Write the implementation**

```typescript
// src/core/team-memory.ts
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface Memory {
  id: string;
  agentId: string;
  type: string;
  content: string;
  tags: string;
  createdAt: number;
  updatedAt: number;
}

export class TeamMemory {
  private db: Database;

  constructor(sqlitePath: string) {
    mkdirSync(join(sqlitePath, '..'), { recursive: true });
    this.db = new Database(sqlitePath);
    this.migrate();
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
    this.db.prepare(
      `INSERT INTO memories (id, agent_id, type, content, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, agentId, type, content, tags, now, now);
    return id;
  }

  search(query: string, opts: { type?: string; limit?: number } = {}): Memory[] {
    const limit = opts.limit ?? 10;
    if (opts.type) {
      return this.db.prepare(
        `SELECT m.id, m.agent_id, m.type, m.content, m.tags, m.created_at, m.updated_at
         FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ? AND m.type = ?
         LIMIT ?`
      ).all(query, opts.type, limit) as Memory[];
    }
    return this.db.prepare(
      `SELECT m.id, m.agent_id, m.type, m.content, m.tags, m.created_at, m.updated_at
       FROM memories_fts f
       JOIN memories m ON m.rowid = f.rowid
       WHERE memories_fts MATCH ?
       LIMIT ?`
    ).all(query, limit) as Memory[];
  }

  recent(limit: number): Memory[] {
    return this.db.prepare(
      `SELECT id, agent_id, agent_id as agentId, type, content, tags,
              created_at as createdAt, updated_at as updatedAt
       FROM memories ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as Memory[];
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
bun test tests/team-memory.test.ts
```
Expected: all 6 tests PASS

**Step 5: Check TypeScript**

```bash
bun tsc --noEmit
```
Expected: no errors

**Step 6: Commit**

```bash
git add src/core/team-memory.ts tests/team-memory.test.ts
git commit -m "feat: add TeamMemory class with SQLite/FTS5 storage"
```

---

### Task 2: `OrgStore.readTeam()` + `OrgLoader.loadTeams()` + `OrgLoader.resolveTeam()`

**Files:**
- Modify: `src/core/org-store.ts`
- Modify: `src/core/org-loader.ts`
- Modify: `tests/org.test.ts`

**Step 1: Write the failing test**

Add to `tests/org.test.ts` inside the `describe('OrgLoader', ...)` block:

```typescript
  test('loadTeams returns role lists by team name', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(teams.size).toBeGreaterThan(0);
    const engRoles = teams.get('engineering');
    expect(engRoles).toContain('swe');
    expect(engRoles).toContain('eng-director');
  });

  test('resolveTeam returns team name for known role', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(loader.resolveTeam('swe', teams)).toBe('engineering');
    expect(loader.resolveTeam('eng-director', teams)).toBe('engineering');
  });

  test('resolveTeam returns executive for unknown role', async () => {
    const loader = createTestLoader();
    const teams = await loader.loadTeams();
    expect(loader.resolveTeam('ceo', teams)).toBe('executive');
  });
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/org.test.ts
```
Expected: FAIL with `loader.loadTeams is not a function`

**Step 3: Add `OrgStore.readTeam()`**

In `src/core/org-store.ts`, add after `listTeamNames()`:

```typescript
  async readTeam(name: string): Promise<string | null> {
    validateId(name, 'team name');
    return this.layeredFs.readFile(`teams/${name}.md`);
  }
```

**Step 4: Add `OrgLoader.loadTeams()` and `OrgLoader.resolveTeam()`**

In `src/core/org-loader.ts`, add after `loadChannels()`:

```typescript
  async loadTeams(): Promise<Map<string, string[]>> {
    const names = await this.store.listTeamNames();
    const teams = new Map<string, string[]>();
    for (const name of names) {
      const raw = await this.store.readTeam(name);
      if (!raw) continue;
      const { data: fm } = parseFrontMatter<Record<string, unknown>>(raw);
      const members = Array.isArray(fm.members) ? (fm.members as string[]) : [];
      teams.set(name, members);
    }
    return teams;
  }

  resolveTeam(roleId: string, teams: Map<string, string[]>): string {
    for (const [teamName, roles] of teams) {
      if (roles.includes(roleId)) return teamName;
    }
    return 'executive';
  }
```

**Step 5: Run tests to verify they pass**

```bash
bun test tests/org.test.ts
```
Expected: all tests PASS

**Step 6: Check TypeScript**

```bash
bun tsc --noEmit
```
Expected: no errors

**Step 7: Commit**

```bash
git add src/core/org-store.ts src/core/org-loader.ts tests/org.test.ts
git commit -m "feat: add OrgLoader.loadTeams and resolveTeam for team membership lookup"
```

---

### Task 3: Wire `TeamMemory` into `Org` and `Agent`

**Files:**
- Modify: `src/core/agent.ts` — add `teamMemory` to `AgentContext`
- Modify: `src/core/org.ts` — create `TeamMemory` instances, inject into agents

**Step 1: Update `AgentContext` in `src/core/agent.ts`**

Add the import at the top:
```typescript
import type { TeamMemory } from './team-memory';
```

Add `teamMemory` to the `AgentContext` interface:
```typescript
export interface AgentContext {
  role: RoleConfig;
  skills: SkillConfig[];
  agentId: string;
  channels?: ChannelConfig[];
  llm: ILLMClient;
  tools: ToolRegistry;
  channelManager: ChannelManager;
  teamMemory: TeamMemory;
}
```

Add a private field to the `Agent` class (after `private channelMgr: ChannelManager;`):
```typescript
  private teamMemory: TeamMemory;
```

Assign it in the constructor (after `this.channelMgr = context.channelManager;`):
```typescript
    this.teamMemory = context.teamMemory;
```

**Step 2: Inject recent memories in `Agent.handleMessage()`**

Replace the current `handleMessage` body:

```typescript
  async handleMessage(msg: ChannelMessage, channel: Channel): Promise<void> {
    this.log.info({ messageId: msg.id, channel: msg.channel, from: msg.from }, 'Handling message');

    const rootId = msg.threadId ?? msg.id;
    const thread = channel.getThread(rootId);
    const threadText = thread.map(m => `[${m.from}]: ${m.content}`).join('\n');

    const recent = this.teamMemory.recent(10);
    const memoryPrefix = recent.length > 0
      ? `## Recent Team Memory\n${recent.map(m => `[${m.type}][${m.agentId}] ${m.content}`).join('\n')}\n\n`
      : '';

    const input = `${memoryPrefix}[Channel: #${msg.channel}]\n${threadText}`;

    const response = await this.think(input);

    if (response.trim() !== 'NO_ACTION') {
      this.log.debug({ messageId: msg.id }, 'Response generated');
    } else {
      this.log.debug({ messageId: msg.id }, 'NO_ACTION — skipping reply');
    }

    channel.done(msg.id);
  }
```

**Step 3: Update `Org` to create and inject `TeamMemory` instances**

In `src/core/org.ts`, add imports:
```typescript
import { TeamMemory } from './team-memory';
import { join } from 'path';
```

Add `agentOrgDir: string` to the `Org` constructor:
```typescript
  constructor(
    private loader: OrgLoader,
    private channelManager: ChannelManager,
    private llm: ILLMClient,
    private toolRunner: ToolRunner,
    private agentOrgDir: string,
  ) {}
```

Add a private field to hold team memory instances:
```typescript
  private teamMemories: Map<string, TeamMemory> = new Map();
```

Add a private helper method to get or create a `TeamMemory` for a team:
```typescript
  private getOrCreateTeamMemory(teamName: string): TeamMemory {
    if (!this.teamMemories.has(teamName)) {
      const dbPath = join(this.agentOrgDir, 'teams', teamName, 'memory.sqlite');
      this.teamMemories.set(teamName, new TeamMemory(dbPath));
    }
    return this.teamMemories.get(teamName)!;
  }
```

Update `spawnAgent()` to accept + use `teamMemory`:
```typescript
  private async spawnAgent(id: string, member: OrgMember, teamMemory: TeamMemory): Promise<Agent> {
    const role = await this.loader.loadRole(member.role);
    const skills = await this.loader.loadSkillsForRole(role, id);
    const tools = this.buildToolRegistry(id, skills, teamMemory, role.level);
    return new Agent({
      agentId: id, role, skills,
      channels: this.channels,
      llm: this.llm,
      tools,
      channelManager: this.channelManager,
      teamMemory,
    });
  }
```

Update `boot()` to load teams and resolve each agent's team before spawning:
```typescript
  async boot(): Promise<void> {
    this.members = await this.loader.loadMembers();
    this.channels = await this.loader.loadChannels();
    const teams = await this.loader.loadTeams();

    for (const ch of this.channels) {
      this.channelManager.create(ch.name);
    }
    const teamNames = await this.loader.getStore().listTeamNames();
    for (const name of teamNames) {
      this.channelManager.create(name);
    }

    for (const [id, member] of this.members) {
      try {
        const role = await this.loader.loadRole(member.role);
        const teamName = this.loader.resolveTeam(role.id, teams);
        const teamMemory = this.getOrCreateTeamMemory(teamName);
        const agent = await this.spawnAgent(id, member, teamMemory);
        this.agents.set(id, agent);
      } catch (err) {
        logger.error({ err, agentId: id }, 'Failed to instantiate agent');
      }
    }

    for (const agent of this.agents.values()) {
      await agent.start();
    }

    logger.info({ agentCount: this.agents.size }, 'All agents booted');
  }
```

Also update `reload()` to resolve team when spawning new agents. In the `!prevIds.has(id)` branch, replace the `spawnAgent` call:
```typescript
        try {
          const role = await this.loader.loadRole(member.role);
          const teams = await this.loader.loadTeams();
          const teamName = this.loader.resolveTeam(role.id, teams);
          const teamMemory = this.getOrCreateTeamMemory(teamName);
          const agent = await this.spawnAgent(id, member, teamMemory);
          this.agents.set(id, agent);
          await agent.start();
        } catch (err) {
          logger.error({ err, agentId: id }, 'Failed to add agent during reload');
        }
```

**Step 4: Update `src/index.ts` to pass `agentOrgDir` to `Org`**

Change the `Org` construction line:
```typescript
  org = new Org(loader, channels, llm, toolRunner, paths.agentOrgDir);
```

**Step 5: Check TypeScript**

```bash
bun tsc --noEmit
```
Expected: no errors

**Step 6: Run existing tests**

```bash
bun test
```
Expected: all tests PASS (note: `org.test.ts` creates its own `OrgLoader` directly and doesn't test `Org`, so no changes needed there)

**Step 7: Commit**

```bash
git add src/core/agent.ts src/core/org.ts src/index.ts
git commit -m "feat: wire TeamMemory into Org and Agent — inject recent memories per message"
```

---

### Task 4: Register `save_memory` and `search_memory` tools

**Files:**
- Modify: `src/core/org.ts` — update `buildToolRegistry()` to accept and register memory tools

**Step 1: Update `buildToolRegistry()` signature**

In `src/core/org.ts`, update the method signature:
```typescript
  private buildToolRegistry(
    agentId: string,
    skills: SkillConfig[],
    teamMemory: TeamMemory,
    level: string,
  ): ToolRegistry {
```

**Step 2: Add `save_memory` and `search_memory` to the registry**

After the existing `.register({ name: 'execute_tool', ... })` call, chain two more:

```typescript
      .register({
        name: 'save_memory',
        description: 'Save a lesson, decision, or fact to team memory for future reference',
        schema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['decision', 'lesson', 'fact'],
              description: 'Type of memory',
            },
            content: { type: 'string', description: 'The memory content' },
            tags: {
              type: 'string',
              description: 'Comma-separated tags, e.g. "api,github,rate-limits"',
            },
          },
          required: ['type', 'content'],
        },
        handler: async ({ type, content, tags }) => {
          const id = teamMemory.save(agentId, type as string, content as string, tags as string ?? '');
          return `Memory saved (id: ${id})`;
        },
      })
      .register({
        name: 'search_memory',
        description: 'Search team memory for relevant knowledge before acting',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Full-text search query' },
            type: {
              type: 'string',
              enum: ['decision', 'lesson', 'fact'],
              description: 'Optional: filter by memory type',
            },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
          required: ['query'],
        },
        handler: async ({ query, type, limit }) => {
          const opts = { type: type as string | undefined, limit: (limit as number) ?? 10 };
          const results = teamMemory.search(query as string, opts);
          // Directors also search executive memory
          if (level === 'director' || level === 'executive') {
            const execPath = join(this.agentOrgDir, 'teams', 'executive', 'memory.sqlite');
            const execMem = this.getOrCreateTeamMemory('executive');
            const execResults = execMem.search(query as string, opts);
            // Merge and deduplicate by id
            const seen = new Set(results.map(r => r.id));
            for (const r of execResults) {
              if (!seen.has(r.id)) results.push(r);
            }
          }
          if (results.length === 0) return 'No matching memories found.';
          return results.map(r => `[${r.type}][${r.agentId}] ${r.content} (tags: ${r.tags})`).join('\n');
        },
      });
```

**Step 3: Check TypeScript**

```bash
bun tsc --noEmit
```
Expected: no errors

**Step 4: Run all tests**

```bash
bun test
```
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/core/org.ts
git commit -m "feat: register save_memory and search_memory tools — directors also search executive DB"
```

---

### Task 5: Smoke test with dummy LLM

**Step 1: Start the server with dummy LLM**

```bash
USE_DUMMY_LLM=1 GENAT_ROOT=. bun run src/index.ts
```
Expected: server starts, agents boot, log shows `All agents booted` with `agentCount: 3`

**Step 2: Post a test directive**

In a second terminal:
```bash
curl -s -X POST http://localhost:3000/api/directives \
  -H "Content-Type: application/json" \
  -d '{"content": "test memory system"}'
```
Expected: `{"ok":true,...}`

**Step 3: Verify no errors in server logs**

Expected: no stack traces, no crashes. Agents respond with `NO_ACTION` (dummy LLM behavior).

**Step 4: Verify SQLite files are created**

```bash
ls agent/org/teams/*/memory.sqlite 2>/dev/null || echo "no files yet (lazy creation is OK)"
```

Expected: either files exist (if any agent ran `save_memory`) or `no files yet` (lazy creation only happens on first write). Both are correct.

**Step 5: Commit if any last fixes needed, otherwise done**

```bash
git status
```
If clean, nothing to do. If there are any fixup changes:
```bash
git add -A
git commit -m "fix: address smoke test issues"
```

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `src/core/team-memory.ts` | **New** — `TeamMemory` class with SQLite/FTS5 |
| `src/core/org-store.ts` | Add `readTeam(name)` |
| `src/core/org-loader.ts` | Add `loadTeams()`, `resolveTeam()` |
| `src/core/agent.ts` | Add `teamMemory` to `AgentContext`, inject recent memories in `handleMessage()` |
| `src/core/org.ts` | Accept `agentOrgDir`, create `TeamMemory` instances, register tools |
| `src/index.ts` | Pass `paths.agentOrgDir` to `Org` constructor |
| `tests/team-memory.test.ts` | **New** — `TeamMemory` unit tests |
| `tests/org.test.ts` | Add `loadTeams` and `resolveTeam` tests |
