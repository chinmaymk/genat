---
name: github-pr
description: Create and manage pull requests using the GitHub CLI (gh). Use when proposing code changes, opening PRs after implementation, linking to issues, or working with draft PRs and PR status.
compatibility: Requires gh CLI on PATH and gh auth login.
metadata:
  displayName: Create GitHub PRs
  tool: gh
  requires:
    cli: gh
---

# Create GitHub PRs

## Overview

Use the GitHub CLI (`gh`) to create pull requests. PRs are the standard mechanism for proposing and reviewing code changes. Every non-trivial change to the codebase should go through a PR before being merged into the main branch.

## Prerequisites

- `gh` CLI must be installed and available on `PATH`.
- You must be authenticated: run `gh auth status` to verify.

```bash
gh auth status
```

If not authenticated:
```bash
gh auth login
```

## Creating a Pull Request

### Basic PR Creation

```bash
gh pr create --title "feat: add user authentication" --body "Implements JWT-based login and registration."
```

### PR with Full Description (recommended)

Use a heredoc to write a multi-line description:

```bash
gh pr create \
  --title "feat: add user authentication" \
  --body "$(cat <<'EOF'
## Summary

- Adds POST /auth/login and POST /auth/register endpoints
- Implements JWT token generation and validation
- Adds middleware for protecting authenticated routes

## Changes

- `src/routes/auth.ts` - new auth routes
- `src/middleware/authenticate.ts` - JWT validation middleware
- `src/services/auth.ts` - token generation logic
- `tests/routes/auth.test.ts` - unit tests

## Testing

- All existing tests pass: `bun test`
- New tests added for login, register, and auth middleware
- Manually tested happy path and error cases

Closes #42
EOF
)"
```

### Draft PRs

Open a draft PR when the work is not yet ready for review (e.g., you want early feedback on direction):

```bash
gh pr create --title "WIP: refactor database layer" --body "Early draft for direction feedback." --draft
```

Mark a draft as ready for review when done:

```bash
gh pr ready
```

## PR Title Conventions

Follow the conventional commits format for PR titles:

| Prefix | Use for |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `chore:` | Maintenance, dependencies, config |
| `refactor:` | Code refactoring without behavior change |
| `test:` | Test additions or fixes |
| `docs:` | Documentation changes |
| `perf:` | Performance improvements |

Examples:
- `feat: add pagination to issues list`
- `fix: resolve null pointer in user lookup`
- `chore: upgrade bun to 1.2.0`

## Linking Issues

Always link the PR to the relevant GitHub Issue. Use "Closes #N" in the PR body to automatically close the issue when the PR is merged:

```
Closes #42
```

Or for multiple issues:
```
Closes #42, closes #43
```

## Targeting a Specific Base Branch

By default, PRs target the repository's default branch (usually `main`). To target a different branch:

```bash
gh pr create --base staging --title "feat: deploy preview feature to staging"
```

## Useful Commands After Creating a PR

Check the status of your PR and its CI checks:
```bash
gh pr status
gh pr checks
```

View the PR in the browser:
```bash
gh pr view --web
```

## PR Checklist (Before Creating)

Before opening a PR, verify:
- [ ] `bun test` passes with no failures
- [ ] `bun run typecheck` passes with no type errors
- [ ] `bun run lint` passes with no lint errors
- [ ] The PR description explains what changed and why
- [ ] The relevant GitHub Issue is linked with "Closes #N"
- [ ] The branch is up to date with `main` (rebase if necessary)
