---
name: code-with-claude
description: Spawn Claude as a coding assistant to read, write, and reason about code in your repository. Use when implementing a feature, fixing a bug, writing tests, or performing any task that involves reading or modifying code.
compatibility: Requires claude CLI on PATH and ANTHROPIC_API_KEY set.
metadata:
  displayName: Code with Claude Code
  tool: claude-code
  requires:
    cli: claude
    env:
      - ANTHROPIC_API_KEY
---

# Code with Claude Code

## Overview

Claude Code is Anthropic's official CLI for Claude. It allows you to spawn Claude as a coding assistant that can read, write, and reason about code in your repository. Use this skill whenever you need to implement a feature, fix a bug, write tests, or perform any task that involves reading or modifying code.

## Prerequisites

- `claude` CLI must be installed and available on `PATH`.
- `ANTHROPIC_API_KEY` environment variable must be set with a valid Anthropic API key.

Verify setup:
```bash
claude --version
echo $ANTHROPIC_API_KEY | head -c 10  # should print the first 10 chars of your key
```

## Basic Usage

Run Claude Code in the current directory:
```bash
claude
```

Pass a task directly as a prompt (non-interactive / one-shot mode):
```bash
claude -p "Add a health check endpoint at GET /health that returns {status: 'ok'}"
```

Run with a specific working directory:
```bash
claude --cwd /path/to/project -p "Fix the type error in src/auth.ts"
```

## Crafting Effective Task Descriptions

Claude performs best when given clear, complete context. A good task description includes:

1. **What to build**: The specific feature, fix, or change required.
2. **Where**: File paths, modules, or components affected.
3. **Acceptance criteria**: How to know the task is done correctly.
4. **Constraints**: Style conventions, libraries to use/avoid, things not to change.

### Example: Good Task Description

```bash
claude -p "
Implement a login endpoint in src/routes/auth.ts.

Requirements:
- POST /auth/login
- Accept JSON body: {email: string, password: string}
- Validate inputs (non-empty, valid email format)
- Return 400 with error message if validation fails
- Return 401 if credentials are incorrect
- Return 200 with {token: string, expiresAt: string} on success
- Use the existing UserService from src/services/user.ts
- Follow the error response format in src/lib/errors.ts
- Add unit tests in tests/routes/auth.test.ts
"
```

### Example: Poor Task Description (avoid)

```bash
claude -p "make login work"
```

## Tips for Best Results

- **Provide file paths**: Tell Claude which files to read and which to modify. This reduces hallucination and speeds up the task.
- **Reference existing patterns**: Point Claude to existing code that demonstrates the pattern you want followed (e.g., "follow the same pattern as src/routes/users.ts").
- **Specify test requirements**: Always mention whether tests are required and where they should live.
- **Set scope boundaries**: If there are files Claude should not touch, say so explicitly.
- **One concern per invocation**: Claude does best when a task is focused. Split large tasks into smaller, sequential invocations.

## Using Claude with Git Worktrees

For parallel work on multiple tasks, use the `git-worktree` skill to create a worktree per branch, then run Claude in that directory with `--cwd`:

```bash
# See the git-worktree skill for full usage. Example:
git worktree add ../project-feature-auth feat/add-auth
claude --cwd ../project-feature-auth -p "Implement the auth feature as described in issue #42"
```

## Reviewing Claude's Output

Always review Claude's changes before committing or opening a PR:
```bash
git diff
git diff --stat  # summary of changed files
```

Run tests to verify correctness:
```bash
bun test
bun run typecheck
bun run lint
```

If Claude's output is not quite right, iterate:
```bash
claude -p "The tests are failing because X. Fix the implementation in src/foo.ts to handle Y edge case."
```

## Model Selection

By default, Claude Code uses the latest available model. To pin to a specific model (e.g., for reproducibility):

```bash
claude --model claude-opus-4-6 -p "your task here"
```

Available models: `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-3-5`.
