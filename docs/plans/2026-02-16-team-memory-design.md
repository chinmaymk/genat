# Team-Scoped Agent Memory — Design

**Date:** 2026-02-16
**Status:** Approved

## Problem

Agents have no persistent memory. Conversation history is bounded to 24 messages and lost on restart. There is no way for agents to retain lessons, decisions, or facts across sessions, and no mechanism for teammates to share knowledge.

## Goals

- Persist agent knowledge across restarts
- Enable teammates to share learned knowledge
- Support top-down information flow (decisions cascade down hierarchy)
- Support lateral knowledge sharing within teams
- Scale to 1000+ agents without contention or noise

## Non-Goals

- Cross-team memory access (use channels for cross-team communication)
- Automatic memory extraction (agents decide what to remember)
- Semantic/vector search (FTS5 is sufficient for v1)
- Memory persistence across git (SQLite lives in the agent layer, gitignored)

## Approach

Team-scoped memory using per-team SQLite databases with FTS5. Each team has its own isolated database in the agent layer. Agents save memories explicitly via tool and retrieve via hybrid injection (recent memories in prompt) plus on-demand search. Cross-team knowledge sharing happens through existing channel conversations.

## Storage Layout

```
# Agent layer (gitignored, written by agents at runtime)
agent/org/teams/engineering/memory.sqlite
agent/org/teams/product/memory.sqlite
agent/org/teams/executive/memory.sqlite
```

Databases are created lazily on first write. Each team's SQLite file is independent — no cross-DB joins, no shared state. One file per team.

The user layer (`org/teams/*.md`) remains unchanged — team definitions stay as markdown, memories are separate.

## Schema

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,          -- uuid
  agent_id TEXT NOT NULL,       -- who saved it (e.g. "swe-1")
  type TEXT NOT NULL,           -- 'decision' | 'lesson' | 'fact'
  content TEXT NOT NULL,        -- free-form text
  tags TEXT,                    -- comma-separated (e.g. "api,github,rate-limits")
  created_at INTEGER NOT NULL,  -- unix ms
  updated_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, tags,
  content='memories',
  content_rowid='rowid',
  tokenize='porter'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags)
  VALUES ('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags)
  VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, new.tags);
END;
```

## Team Resolution

Each agent maps to a team via `org/teams/*.md`. Resolution is done at boot by `OrgLoader`.

| Agent | Role | Team | Memory DB |
|-------|------|------|-----------|
| swe-1 | swe | engineering | `agent/org/teams/engineering/memory.sqlite` |
| eng-director | eng-director | engineering | `agent/org/teams/engineering/memory.sqlite` |
| ceo | ceo | executive | `agent/org/teams/executive/memory.sqlite` |

Agents not listed in any team file fall back to `executive`. Directors belong to their own team's DB and additionally can search the `executive` DB.

## Agent Tools

### `save_memory`

Writes to the agent's team database.

```typescript
{
  name: "save_memory",
  description: "Save a lesson, decision, or fact to team memory for future reference",
  parameters: {
    type: { enum: ["decision", "lesson", "fact"] },
    content: { type: "string" },
    tags: { type: "string", description: "comma-separated tags, e.g. 'api,github,rate-limits'" }
  }
}
```

### `search_memory`

FTS5 full-text search over team memory. Directors additionally search the `executive` DB.

```typescript
{
  name: "search_memory",
  description: "Search team memory for relevant knowledge before acting",
  parameters: {
    query: { type: "string" },
    type: { enum: ["decision", "lesson", "fact"], optional: true },
    limit: { type: "number", default: 10 }
  }
}
```

## Hybrid Retrieval

On each message, before the agent calls `think()`:

1. Fetch the **10 most recent memories** from the team DB
2. Inject as a `## Recent Team Memory` section prepended to the message input
3. Agent has `search_memory` tool for deeper on-demand lookups

```typescript
// Agent.handleMessage() — before think()
const recent = teamMemory.recent(10);
const memoryContext = recent.length > 0
  ? `## Recent Team Memory\n${recent.map(m => `[${m.type}][${m.agent_id}] ${m.content}`).join('\n')}\n\n`
  : '';
const input = `${memoryContext}[Channel: #${msg.channel}]\n${threadText}`;
```

Token cost: ~500–1000 tokens for 10 memories. Gives agents ambient awareness of recent team activity without requiring an explicit tool call.

## Core Class: `TeamMemory`

New file: `src/core/team-memory.ts`

```typescript
export interface Memory {
  id: string;
  agentId: string;
  type: 'decision' | 'lesson' | 'fact';
  content: string;
  tags: string;
  createdAt: number;
  updatedAt: number;
}

export class TeamMemory {
  constructor(sqlitePath: string)   // opens or creates DB lazily, runs migrations

  save(agentId: string, type: string, content: string, tags?: string): string  // returns id
  search(query: string, opts?: { type?: string; limit?: number }): Memory[]    // FTS5
  recent(limit: number): Memory[]                                               // by created_at DESC
  delete(id: string): void
}
```

One `TeamMemory` instance per team, held by `Org` and injected into each `Agent`.

## Integration Points

### `OrgLoader`

Add `resolveTeam(agentId: string): string` — scans parsed team files to find which team the agent belongs to. Returns `"executive"` as fallback.

### `Org`

- At boot: call `OrgLoader.resolveTeam()` per agent, create `TeamMemory` instances keyed by team name (one instance shared across agents on the same team)
- Pass `teamMemory: TeamMemory` into `Agent` constructor

### `Agent`

- Accept `teamMemory: TeamMemory` in constructor context
- In `handleMessage()`: call `teamMemory.recent(10)` and prepend to input

### `Org.buildToolRegistry()`

Register `save_memory` and `search_memory` tools for every agent, bound to the agent's `TeamMemory` instance. Directors receive a wrapped instance that merges results from both their team DB and the executive DB.

## Scaling Model

- **Team size** — keep teams at 5–15 agents. When a team grows beyond that, split it by adding eng-managers or sub-teams. Each sub-team gets its own `memory.sqlite`.
- **Cross-team knowledge** — agents ask on shared channels. The responding agent's knowledge is available in the thread; they can also `save_memory` to persist it to their team's DB.
- **Director visibility** — directors search both their team DB and the executive DB, giving them cross-org decision context without exposing raw IC memories.
- **CEO** — searches the executive DB, which accumulates cross-org decisions escalated by directors.
- **1000+ agents at 50 teams of 20** — 50 independent SQLite files, no contention, no shared state, linear scaling.

## File Changes

| Action | Path |
|--------|------|
| New | `src/core/team-memory.ts` — `TeamMemory` class |
| Modify | `src/core/org-loader.ts` — add `resolveTeam()` |
| Modify | `src/core/org.ts` — create `TeamMemory` instances at boot, inject into agents |
| Modify | `src/core/agent.ts` — accept `teamMemory`, prepend recent memories in `handleMessage()` |
| Modify | `src/core/tool-registry.ts` or `org.ts` — register `save_memory` / `search_memory` tools |
| New | `tests/team-memory.test.ts` — unit tests for `TeamMemory` |
