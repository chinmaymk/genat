---
name: code-with-gemini
description: Use Google's Gemini CLI to run Gemini models as a coding assistant for reading, writing, and reasoning about code. Use as an alternative to code-with-claude or code-with-codex when Google models are preferred, in GCP-adjacent environments, or when Anthropic/OpenAI keys are unavailable.
compatibility: Requires gemini CLI on PATH and GOOGLE_API_KEY (or gemini auth login).
metadata:
  displayName: Code with Gemini CLI
  tool: gemini-cli
  requires:
    cli: gemini
    env:
      - GOOGLE_API_KEY
---

# Code with Gemini CLI

## Overview

Gemini CLI is Google's command-line interface for Gemini AI models. It allows you to use Google's Gemini models as a coding assistant to read, write, and reason about code. Use this skill as an alternative to `code-with-claude` or `code-with-codex` when Google's models are preferred, when running in a GCP-adjacent environment, or when Anthropic or OpenAI keys are unavailable.

## Prerequisites

- `gemini` CLI must be installed and available on `PATH`.
- `GOOGLE_API_KEY` environment variable must be set with a valid Google API key.

Verify setup:
```bash
gemini --version
echo $GOOGLE_API_KEY | head -c 10  # should print the first 10 chars of your key
```

Install the CLI if not present:
```bash
npm install -g @google/gemini-cli
```

Alternatively, authenticate via Google account:
```bash
gemini auth login
```

## Basic Usage

Run Gemini CLI interactively in the current directory:
```bash
gemini
```

Pass a task as a prompt (non-interactive):
```bash
gemini -p "Add a health check endpoint at GET /health that returns {status: 'ok'}"
```

Run in YOLO mode (fully automated, no confirmations) - use in controlled environments:
```bash
gemini --yolo -p "Fix the TypeScript errors in src/auth.ts"
```

## Model Selection

Specify which Gemini model to use:

```bash
gemini --model gemini-2.5-pro -p "your task here"
gemini --model gemini-2.0-flash -p "your task here"
```

Available models (as of early 2026):
- `gemini-2.5-pro` - Most capable, best for complex reasoning and large codebases
- `gemini-2.0-flash` - Fast and efficient, good for focused tasks
- `gemini-2.0-flash-thinking` - Enhanced reasoning for complex problems

Check `gemini --help` or the Google AI documentation for the current model list.

## Crafting Effective Task Descriptions

As with all AI coding assistants, clear task descriptions produce better results. Include:

1. **What to build**: Specific feature, fix, or change.
2. **Where**: File paths and modules involved.
3. **Acceptance criteria**: What done looks like.
4. **Constraints**: Libraries to use, patterns to follow, files not to touch.

### Example

```bash
gemini --yolo -p "
Implement retry logic for the HTTP client in src/lib/http.ts.

Requirements:
- Retry failed requests up to 3 times with exponential backoff (1s, 2s, 4s delays)
- Only retry on network errors and 5xx responses, not on 4xx errors
- Add a configurable timeout per request (default 30 seconds)
- Export the updated client as the default export
- Add unit tests in tests/lib/http.test.ts using mocked fetch
- Do not change the public API signature of the existing functions
"
```

## Context Window Advantages

Gemini models support very large context windows (up to 1 million tokens in some configurations). This makes Gemini CLI particularly well-suited for:

- Tasks that require reading many large files simultaneously.
- Refactoring that spans many files across a large codebase.
- Tasks where broad codebase understanding is critical before making any changes.

When working on large-scale tasks, you can provide more context upfront:

```bash
gemini -p "
Read the following files before implementing anything:
- src/lib/db.ts
- src/models/user.ts
- src/models/session.ts
- src/routes/auth.ts
- tests/routes/auth.test.ts

Then implement password reset functionality following the patterns in those files.
Acceptance criteria: ...
"
```

## Tips for Best Results

- **Provide file paths**: Specify which files to read and modify.
- **Reference existing patterns**: Point Gemini to existing code that demonstrates the pattern you want.
- **Specify test requirements**: Always mention whether tests are required and where they should live.
- **Use `--yolo` in automation**: For agent-corp automated workflows, `--yolo` is the appropriate mode.
- **Verify output**: Always run `bun test`, `bun run typecheck`, and `bun run lint` after Gemini completes.

## Reviewing Output

After Gemini CLI completes a task:
```bash
git diff                  # review all changes
git diff --stat           # summary of changed files
bun test                  # run tests
bun run typecheck         # check types
bun run lint              # check lint
```

If the output needs iteration:
```bash
gemini --yolo -p "Tests are failing with error X. Fix the implementation in src/foo.ts."
```

## Comparison with Other Coding CLIs

| CLI | Provider | Key Strength |
|-----|----------|--------------|
| `claude` | Anthropic | Strong instruction-following, code quality |
| `codex` | OpenAI | o-series reasoning models |
| `gemini` | Google | Large context window, GCP integration |

All three are capable coding assistants. Choose based on availability, model preference, and task characteristics.
