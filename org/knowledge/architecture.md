# Architecture Overview

This document describes the architecture of agent-corp: a markdown-driven, multi-agent autonomous organization built on Bun, TypeScript, and Claude.

## High-Level Concept

agent-corp is a system for running a simulated organization composed of AI agents. Each agent corresponds to a real organizational role (CEO, Engineering Director, Software Engineer, etc.), reads a markdown role definition for its system prompt, and uses tool calls to communicate, manage work, and run CLI tools like `claude`, `gh`, and deployment scripts.

The system is entirely configuration-driven: the organizational structure, agent capabilities, and team channels are all defined in markdown files under `org/`. No code changes are required to add new roles, agents, or skills.

## Directory Structure

```
agent-corp/
  src/
    index.ts              # Entry point: boots the system
    core/
      agent.ts            # Agent class and agentic loop
      channel.ts          # In-memory pub/sub channel system
      org.ts              # Org loader: parses org.md, roles, skills
      task-manager.ts     # SQLite-backed hierarchical task tracker
      tool-runner.ts      # Executes CLI tools (claude, gh, etc.)
      work-queue.ts       # In-memory priority work queue
    web/
      server.ts           # Hono HTTP server
      routes.ts           # Web UI and API routes
      ui/index.tsx        # React UI (compiled separately)
    memory/
      store.ts            # SQLite-backed agent memory with FTS5 search
      knowledge-base.ts   # Loads org/knowledge/*.md files
    hiring/
      interviewer.ts      # Evaluates candidate agents
    self-improve/
      retro.ts            # Retrospective/self-improvement loop
  org/
    org.md                # Org chart: who exists, what role they have
    roles/                # One .md per role (frontmatter + system prompt)
    skills/               # One directory per skill with SKILL.md (Agent Skills format)
    teams/                # One .md per team (channels, queues, members)
    knowledge/            # Shared knowledge: conventions, architecture
  data/
    tasks.sqlite          # Persistent task database
    memory.sqlite         # Persistent agent memory database
  tests/                  # Bun test files
```

## Boot Sequence

When `bun run src/index.ts` is executed:

1. **Database initialization**: `TaskManager` and `MemoryStore` open/create their SQLite databases at `data/tasks.sqlite` and `data/memory.sqlite`.

2. **Knowledge base load**: `KnowledgeBase` reads all `.md` files from `org/knowledge/` and makes their content available to agents.

3. **Org load**: `OrgManager.loadOrg()` reads `org/org.md` and parses each `- <id> (role: <role>, reports_to: <manager>)` line into an `OrgMember` record.

4. **Channels and queues**: `OrgManager.setupChannelsAndQueues()` creates the standard channels (`#general`, `#announcements`, `#engineering`) and any team channels defined in `org/teams/*.md`. Work queues are created for each role present in the org.

5. **Agent boot**: For each `OrgMember`, `OrgManager.boot()` reads the corresponding role markdown (`org/roles/<role>.md`), loads each skill listed in the frontmatter from `org/skills/<skill-id>/SKILL.md` (or legacy `org/skills/<skill-id>.md`), and instantiates an `Agent` with the assembled context.

6. **Agent subscription**: Each agent subscribes to all channels and begins listening for messages.

7. **Web server**: A Hono HTTP server starts and serves the board UI.

## Core Components

### OrgManager (`src/core/org.ts`)

Responsible for parsing and loading the organizational configuration from markdown.

- Parses `org/org.md` to build the `OrgMember` map (id, role, reportsTo).
- Loads role files using `gray-matter` to extract YAML frontmatter (id, title, level, reports_to, skills, model, and optional message-routing fields) and the markdown body (used as the system prompt).
- **Channels** (data-driven): if `org/channels.md` exists, channels are created from its YAML `channels` list (each entry: `id`, optional `primary_handler_role`). Otherwise the default list (general, announcements, engineering, company) and team channels are created. Roles declare which channels they join via `channels:` in role frontmatter; if omitted, the role subscribes to all channels.
- **Message routing** (data-driven): each message is delivered to at most one agent. **Triage**: if the message is in a thread that already has replies, only the agent who first replied in that thread receives it. Otherwise relevance is determined from role data: `handles_sources`, `handles_channels`, `reports_to`, `receives_from_direct_reports`; the channel’s `primary_handler_role` (from `channels.md`) is preferred when multiple agents are relevant. Replies are **threaded**: the agent is prompted to use `threadId` (the message id) when posting so conversations stay in one thread.
- Loads skill files (Agent Skills format: `org/skills/<id>/SKILL.md` with required `name`, `description`, and optional `metadata.displayName`, `metadata.tool`) and assembles `SkillConfig` objects (id, name, tool, full markdown content).
- Creates and starts all `Agent` instances.

**Org member line format** (parsed from `org/org.md`):
```
- <agent-id> (role: <role-id>, reports_to: <manager-id>)
```

When `role:` is omitted, the agent id is treated as the role id.

### Agent (`src/core/agent.ts`)

Each agent is an instance of the `Agent` class. An agent has:

- An **id** (e.g., `swe-1`): the instance identifier.
- A **role** (`RoleConfig`): title, level, reportsTo, skills list, model config, system prompt.
- A **skills list** (`SkillConfig[]`): skill id, name, associated CLI tool, full skill markdown.
- A **conversation history**: the accumulated message/response history for this agent's LLM context.

The agent operates in an **agentic loop**:

1. Receives a trigger (a channel message it did not send itself).
2. Appends the trigger to conversation history.
3. Calls the LLM with the system prompt (role + injected skills + agent identity) and conversation history.
4. If the LLM response includes tool calls, executes them (via `executeSingleTool`) and feeds results back as a user message.
5. Repeats until no more tool calls are returned or `MAX_ITERATIONS` (10) is reached.
6. Appends the final response to conversation history.

**System prompt construction** (`buildSystemPrompt`): The agent's system prompt is assembled at call time from:
1. The role's markdown body (from `org/roles/<role>.md` after frontmatter).
2. Each skill's full markdown content, appended under `## Available Skills`.
3. Agent identity metadata (id, role, reportsTo).
4. Standard instructions (use tools, think step by step).

### Tools Available to Every Agent

All agents have access to these built-in tools:

| Tool | Description |
|------|-------------|
| `post_message` | Post to a channel (with optional thread) |
| `pull_work` | Claim the next work item from a named queue |
| `complete_work` | Mark a work item done and remove it from the queue |
| `create_task` | Create a task in the task manager (directive/epic/story/task) |
| `update_task` | Update task status, assignee, or details |
| `execute_tool` | Run a CLI tool associated with one of the agent's skills |
| `create_work_item` | Push a new work item onto a named queue |

### Channel System (`src/core/channel.ts`)

Channels are in-memory pub/sub queues. A `Channel` stores its message history and a set of subscriber agent IDs. `ChannelManager` maintains all channels and dispatches posted messages synchronously to all subscriber callbacks.

Key behaviors:
- Agents subscribe to all channels on boot.
- Agents do not react to their own messages (sender filter in `Agent.start()`).
- Messages support threaded replies via `threadId`.
- Channel history is in-memory only (not persisted).

Standard channels created at boot: `#general`, `#announcements`, `#engineering`, `#company`, plus one channel per team file in `org/teams/`.

### Work Queue (`src/core/work-queue.ts`)

`WorkQueue` is an in-memory priority queue for distributing work items to agents. Items have:
- A `priority` (integer; lower = higher priority).
- A `status`: `queued`, `claimed`, or `blocked`.
- A `claimedBy` field: the agent id that pulled the item.

`pull()` atomically claims the highest-priority unclaimed item. `complete()` removes it. `block()` suspends it with a reason. `release()` returns it to the queued state.

Work queues are in-memory only (not persisted across restarts). One queue is created per role type present in `org/org.md`, plus an `engineering` queue always exists.

### Task Manager (`src/core/task-manager.ts`)

`TaskManager` is a SQLite-backed hierarchical task tracker. Tasks form a tree: `directive > epic > story > task`. Fields: id, parentId, type, title, description, status, assignee, timestamps, metadata (JSON).

Task statuses: `queued`, `in_progress`, `review`, `done`, `blocked`.

When a task is marked `done`, `checkAutoComplete()` walks up the tree: if all children of a parent are `done`, the parent is automatically marked `done` as well (recursively).

Persisted to `data/tasks.sqlite`. Uses indexed queries for status, assignee, and parentId lookups.

### Memory Store (`src/core/memory.ts` / `src/memory/store.ts`)

`MemoryStore` is a SQLite-backed key-value memory for agents. Each memory record has: agentId, content (text), type (`lesson`, `decision`, `fact`), and a timestamp.

Full-text search is provided via SQLite's FTS5 extension. Triggers keep the FTS index synchronized with the main `memories` table automatically. Falls back to `LIKE` search if the FTS query fails.

Persisted to `data/memory.sqlite`.

### Tool Runner (`src/core/tool-runner.ts`)

`ToolRunner` executes CLI commands on behalf of agents when the `execute_tool` tool is called. It spawns subprocesses (via Bun's subprocess API) with the tool name and arguments. Output is capped at 4000 chars for stdout and 1000 chars for stderr before being returned to the LLM context.

Skills define which CLI tool they invoke (e.g., `code-with-claude` invokes `claude`, `github-pr` invokes `gh`).

### LLM Layer (`src/core/llm.ts`)

`LLMClient` wraps the Anthropic SDK and provides a unified `chat()` interface. It handles tool definitions (passed as Anthropic tool schemas), maps the response to a normalized `LLMResponse` type, and extracts tool calls from the API response.

The model provider is set per role in frontmatter (`model.provider`). The string `"interview"` is a placeholder that resolves to `anthropic` at runtime.

### Board (Web UI)

A Hono HTTP server serves a React-based web dashboard (`src/web/`). The UI provides visibility into:
- Active agents and their roles.
- Channel message history.
- Task tree state.
- Work queue contents.

The UI is compiled separately with `bun build:ui` and served as static assets.

## Data Flow: A Message Triggers Work

```
Board UI or external input
  -> POST /api/channels/:name/messages   (HTTP)
  -> channelManager.post(channel, from, content)
  -> Channel notifies all subscribers
  -> Agent.handleMessage(msg) is called for each subscribed agent (except sender)
  -> Agent.think(input) enters the agentic loop
     -> LLM called with system prompt + conversation history
     -> LLM returns response + optional tool calls
     -> Tool calls executed (post_message, create_task, pull_work, execute_tool, ...)
     -> Tool results fed back to LLM
     -> Loop until no tool calls or MAX_ITERATIONS
  -> Agent may post to channels, create tasks, push work items, or invoke CLI tools
```

## Persistence

| Store | Engine | Persists |
|-------|--------|---------|
| Tasks | SQLite (`data/tasks.sqlite`) | Yes, across restarts |
| Memories | SQLite (`data/memory.sqlite`) | Yes, across restarts |
| Channels | In-memory | No, lost on restart |
| Work queues | In-memory | No, lost on restart |

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (strict) | Type safety, excellent tooling |
| Runtime | Bun | Fast startup, built-in SQLite, native test runner |
| LLM | Anthropic Claude (via SDK) | Best-in-class instruction following and tool use |
| Database | SQLite via better-sqlite3 | Zero-ops, embedded, fast for single-process use |
| HTTP framework | Hono | Lightweight, fast, first-class TypeScript support |
| Markdown parsing | gray-matter | Standard frontmatter parsing for role/skill configs |
| Frontend | React 19 + TSX | Familiar, works with Bun's bundler |

## Extension Points

- **New roles**: Add a `.md` file to `org/roles/` and reference it in `org/org.md`.
- **New skills**: Add a directory `org/skills/<skill-id>/` with a `SKILL.md` file (Agent Skills format: required `name` matching directory, `description`; optional `metadata.displayName`, `metadata.tool`). Add the skill id to the role's frontmatter `skills` list.
- **New teams**: Add a `.md` file to `org/teams/`; a channel is automatically created.
- **New agents**: Add a line to `org/org.md` referencing an existing role.
- **New models**: Change `model.provider` and `model.pinned` in role frontmatter. The LLM layer resolves the provider to the appropriate SDK client.
