---
name: git-worktree
description: Create and manage git worktrees to work on multiple branches in parallel, each with its own working directory. Use when starting a new task branch, isolating work from main, or running coding tools (e.g. claude, codex) in a dedicated directory per branch.
compatibility: Requires git on PATH.
metadata:
  displayName: Git Worktrees
  tool: git
  requires:
    cli: git
---

# Git Worktrees

## Overview

Git worktrees let you check out more than one branch at a time, each in a separate directory. Instead of stashing, switching branches, or cloning the repo again, you create a linked worktree for a branch and work there. Use this skill when you need to keep your main working directory clean, work on multiple tasks in parallel, or give each coding session (e.g. Claude, Codex) its own directory.

## Prerequisites

- `git` must be installed and available on `PATH`.
- You must be inside a git repository (or have a repo path to use as the main worktree).

## When to Use Worktrees

- **One branch per task**: Create a worktree for each GitHub Issue or feature branch so you never mix unrelated changes.
- **Parallel work**: Work on bugfix A in one worktree and feature B in another without switching back and forth.
- **Coding tools**: Run `claude`, `codex`, or `gemini` with `--cwd` pointing at a worktree so each task has isolated files and history.
- **Clean main**: Keep `main` (or your default branch) checked out in the primary directory; do all feature work in worktrees.

## Creating a Worktree

### Basic: new branch in a new worktree

Create a new branch and a worktree for it in one step:

```bash
# Create branch feat/add-auth and worktree at ../project-feat-add-auth
git worktree add ../project-feat-add-auth -b feat/add-auth
```

The new directory `../project-feat-add-auth` now has `feat/add-auth` checked out. Work there; commits go to that branch.

### Existing branch

If the branch already exists (e.g. you created it from an issue):

```bash
git worktree add ../project-fix-login fix/broken-login-redirect
```

### Custom location and branch name

Use a descriptive path and branch name that match the task:

```bash
git worktree add ../agent-corp-issue-42 feat/issue-42-add-health-endpoint
```

## Listing Worktrees

See all worktrees and their branches:

```bash
git worktree list
```

Example output:

```
/path/to/repo           abc123  [main]
/path/to/repo-auth      def456  [feat/add-auth]
/path/to/repo-fix-login ghi789  [fix/broken-login-redirect]
```

## Using a Worktree with Coding Tools

Point the coding CLI at the worktree with `--cwd`:

```bash
# Create worktree for the task
git worktree add ../agent-corp-issue-42 -b feat/issue-42-health

# Run Claude in that worktree
claude --cwd ../agent-corp-issue-42 -p "Implement the health check endpoint as described in issue #42"

# Or Codex
codex --cwd ../agent-corp-issue-42 --approval-mode full-auto "Implement the health check endpoint as described in issue #42"

# Or Gemini
gemini --cwd ../agent-corp-issue-42 --yolo -p "Implement the health check endpoint as described in issue #42"
```

After implementation, from the worktree directory run tests and open a PR:

```bash
cd ../agent-corp-issue-42
bun test
bun run typecheck
gh pr create --title "feat: add health check endpoint" --body "Closes #42"
```

## Removing a Worktree

When the branch is merged (or you no longer need the worktree):

```bash
# Remove the worktree (branch is unchanged)
git worktree remove ../project-feat-add-auth
```

If the worktree has uncommitted or unpushed changes, git may refuse. Either commit and push, or use `--force` after confirming you don't need those changes.

To remove a worktree and delete its branch (e.g. after merge):

```bash
git worktree remove ../project-feat-add-auth
git branch -d feat/add-auth   # delete local branch
```

## Best Practices

- **One worktree per task**: Keeps changes isolated and makes it obvious which directory corresponds to which branch.
- **Descriptive paths**: Use a path that includes the branch or issue id (e.g. `../repo-feat-auth`, `../repo-42`) so you can tell worktrees apart.
- **Branch naming**: Follow conventional branch names: `feat/short-description`, `fix/issue-description`, `chore/task-name`.
- **Prune after merge**: After a PR is merged, remove the worktree and delete the local branch to avoid clutter.
- **Don’t edit the same branch from two worktrees**: Each branch should exist in at most one worktree at a time.

## Common Workflows

### Start a new task from an issue

```bash
# From repo root
git worktree add ../repo-issue-99 -b feat/issue-99-pagination
cd ../repo-issue-99
# Implement, test, then:
gh pr create --title "feat: add pagination" --body "Closes #99"
```

### Run a coding assistant in a worktree

```bash
git worktree add ../repo-auth -b feat/add-auth
claude --cwd ../repo-auth -p "Implement JWT login as specified in issue #42"
```

### List worktrees and clean up merged branches

```bash
git worktree list
git worktree remove ../repo-issue-99   # after PR merged
git branch -d feat/issue-99-pagination
```
