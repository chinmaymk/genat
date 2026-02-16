---
name: code-with-codex
description: Spawn OpenAI's Codex CLI as a coding assistant to read, write, and reason about code. Use as an alternative to code-with-claude when OpenAI models are preferred, when Anthropic keys are unavailable, or when comparing outputs across providers.
compatibility: Requires codex CLI on PATH and OPENAI_API_KEY set.
metadata:
  displayName: Code with Codex
  tool: codex
  requires:
    cli: codex
    env:
      - OPENAI_API_KEY
---

# Code with Codex

## Overview

Codex is OpenAI's CLI coding assistant. It allows you to spawn an AI coding agent powered by OpenAI's models to read, write, and reason about code in your repository. Use this skill as an alternative to `code-with-claude` when OpenAI models are preferred, when running in a context where Anthropic keys are unavailable, or when you want to compare outputs across providers.

## Prerequisites

- `codex` CLI must be installed and available on `PATH`.
- `OPENAI_API_KEY` environment variable must be set with a valid OpenAI API key.

Verify setup:
```bash
codex --version
echo $OPENAI_API_KEY | head -c 10  # should print the first 10 chars of your key
```

Install the CLI if not present:
```bash
npm install -g @openai/codex
```

## Basic Usage

Run Codex interactively in the current directory:
```bash
codex
```

Pass a task directly as a prompt (non-interactive):
```bash
codex "Add a health check endpoint at GET /health that returns {status: 'ok'}"
```

Run in fully automated mode (no confirmation prompts):
```bash
codex --approval-mode full-auto "Fix the TypeScript type errors in src/auth.ts"
```

Run with a specific working directory:
```bash
codex --cwd /path/to/project "Implement the feature described in issue #42"
```

## Approval Modes

Codex supports different levels of automation:

| Mode | Behavior |
|------|---------|
| `suggest` (default) | Codex proposes changes; you approve each one |
| `auto-edit` | Codex edits files automatically; shell commands require approval |
| `full-auto` | Codex operates fully autonomously; use in sandboxed environments |

For automated agent workflows, use `full-auto`:
```bash
codex --approval-mode full-auto "your task here"
```

## Crafting Effective Task Descriptions

As with all AI coding assistants, task quality drives output quality. A good task description for Codex includes:

1. **What to build**: The specific feature, fix, or change required.
2. **Where**: File paths, modules, or components affected.
3. **Acceptance criteria**: How to know the task is done correctly.
4. **Constraints**: Libraries to use, patterns to follow, things not to change.

### Example

```bash
codex --approval-mode full-auto "
Implement a rate limiter middleware in src/middleware/rate-limit.ts.

Requirements:
- Limit each IP address to 100 requests per 15-minute window
- Return HTTP 429 with a Retry-After header when the limit is exceeded
- Use an in-memory store (no external dependencies for now)
- Apply the middleware globally in src/app.ts before other routes
- Add tests in tests/middleware/rate-limit.test.ts
- Follow the existing middleware pattern in src/middleware/authenticate.ts
"
```

## Model Selection

Specify which OpenAI model to use:

```bash
codex --model o4-mini "your task here"
codex --model o3 "your task here"
```

Available models include `o4-mini`, `o3`, and others as OpenAI releases them. Check `codex --help` for the current list.

## Tips for Best Results

- **Provide file paths**: Tell Codex which files to read and which to modify.
- **Reference existing patterns**: Point Codex to existing code that demonstrates the pattern you want followed.
- **Specify test requirements**: Always mention whether tests are required.
- **Use `full-auto` in automation**: For agent-corp workflows, `full-auto` is the appropriate mode.
- **Verify output**: Always run `bun test`, `bun run typecheck`, and `bun run lint` after Codex completes a task.

## Reviewing Output

After Codex completes a task:
```bash
git diff                  # review all changes
git diff --stat           # summary of changed files
bun test                  # run tests
bun run typecheck         # check types
bun run lint              # check lint
```

If the output needs refinement:
```bash
codex --approval-mode full-auto "The tests are failing because X. Fix the issue in src/foo.ts."
```

## Comparison with Claude Code

Both `code-with-claude` and `code-with-codex` are capable AI coding assistants. Use whichever is available and appropriate for the task. Key differences:

- `claude` uses Anthropic's Claude models; `codex` uses OpenAI's models.
- Approval mode configuration differs; Codex uses `--approval-mode`, Claude uses interactive prompts.
- Both support fully automated (non-interactive) operation for agent workflows.
