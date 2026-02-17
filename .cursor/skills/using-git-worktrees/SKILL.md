---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - suggest isolated workspace (e.g. new branch or worktree) for the user to set up
---

# Isolated Workspace (Branch / Worktree)

## Overview

When implementing a feature or plan in Cursor, working in an isolated branch or workspace avoids mixing unfinished work with the main codebase. The **user** sets up isolation; you suggest when and how.

**Core principle:** Suggest isolation when it helps; give the user clear steps to run themselves.

**Announce when relevant:** "For isolation, you may want to work on a new branch or in a separate worktree — I can outline the steps."

## When to Suggest Isolation

- Before executing a multi-task implementation plan
- When starting feature work that might take several steps
- When the user wants to keep main/master clean

**Don't insist:** If the user prefers to work on the current branch, proceed.

## What You Do

1. **Recommend isolation** when starting a plan or feature: e.g. "Consider working on a new branch for this."
2. **If they use git worktrees:** You can suggest steps the user runs themselves, for example:
   - Create a worktree in a directory (e.g. `.worktrees/feature-name` or a path they prefer).
   - Ensure that directory is in `.gitignore` if it's inside the repo.
   - They run: `git worktree add <path> -b <branch-name>`, then open that path in Cursor (or a new window).
3. **If they prefer a simple branch:** Suggest they create and switch to a new branch; they run `git checkout -b <branch-name>` (or equivalent).
4. **After work is done:** Remind them about the finishing-a-development-branch skill for merge/PR/discard options.

## What You Don't Do

- Don't run `git worktree add` or other git commands yourself unless the user explicitly asks you to.
- Don't assume a specific worktree directory; ask or use project convention (e.g. check `.cursor/rules` or project docs for preferences).

## Optional: Project Conventions

If the project specifies where to put worktrees (e.g. in `.cursor/rules` or docs), follow that. Otherwise, suggest common options:

- `.worktrees/<branch-name>/` (project-local, should be in `.gitignore`)
- A separate folder outside the repo
- Or simply a new branch in the same workspace

## Integration

**Related skills:**
- **finishing-a-development-branch** — After work is complete, use that skill to present merge/PR/keep/discard options.
- **executing-plans** / **subagent-driven-development** — When starting a plan, suggest isolation at the beginning if the user wants it.
