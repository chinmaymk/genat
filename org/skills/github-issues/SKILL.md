---
name: github-issues
description: Create, list, update, and manage GitHub Issues using the GitHub CLI. Use for task tracking, work queues, labels, milestones, and coordinating features, bugs, and decisions.
compatibility: Requires gh CLI on PATH and gh auth login.
metadata:
  displayName: GitHub Issues
  tool: gh
  requires:
    cli: gh
---

# GitHub Issues

## Overview

GitHub Issues are the primary coordination tool for all work in agent-corp. Every feature, bug, task, and decision that requires action should have a corresponding GitHub Issue. Issues provide a written record of what was decided, who is doing it, and what the outcome was.

## Prerequisites

- `gh` CLI must be installed and available on `PATH`.
- You must be authenticated: run `gh auth status` to verify.

## Creating Issues

### Basic Issue

```bash
gh issue create --title "feat: add pagination to the issues list" --body "Users cannot navigate large issue lists. Add pagination with 25 items per page."
```

### Issue with Full Description

```bash
gh issue create \
  --title "bug: login fails when email contains uppercase letters" \
  --label "bug,priority:high" \
  --assignee "@me" \
  --body "$(cat <<'EOF'
## Problem

Users who registered with uppercase letters in their email (e.g., User@Example.com) cannot log in. The login check is case-sensitive but registration normalizes emails to lowercase.

## Steps to Reproduce

1. Register with email: Test@Example.com
2. Attempt to login with: Test@Example.com
3. Observe: 401 Unauthorized

## Expected Behavior

Login should succeed. Email comparison should be case-insensitive.

## Acceptance Criteria

- [ ] Login succeeds for emails with any casing
- [ ] Email normalization is applied consistently at login and registration
- [ ] A regression test is added for this case

## Environment

- Version: main branch as of 2026-02-10
- Reported by: user feedback
EOF
)"
```

## Listing and Finding Issues

List all open issues:
```bash
gh issue list
```

Filter by label:
```bash
gh issue list --label "priority:high"
gh issue list --label "status:ready"
```

Filter by assignee:
```bash
gh issue list --assignee "@me"
```

Search by keyword:
```bash
gh issue list --search "auth login"
```

View a specific issue:
```bash
gh issue view 42
```

## Updating Issues

### Add a Comment

```bash
gh issue comment 42 --body "Picked this up. Starting implementation now. Will have a PR up by end of session."
```

### Update Labels

```bash
gh issue edit 42 --add-label "status:in-progress" --remove-label "status:ready"
```

### Assign and Reassign

```bash
gh issue edit 42 --assignee "username"
```

### Close an Issue

When work is complete:
```bash
gh issue close 42 --comment "Completed in PR #87. Verified against acceptance criteria."
```

### Reopen an Issue

If a fix is incomplete or regresses:
```bash
gh issue reopen 42 --comment "Reopening - the fix in PR #87 does not handle the uppercase variant. See comment above."
```

## Issue Labels

Use consistent labels to make the issue tracker navigable.

### Type Labels
| Label | Meaning |
|-------|---------|
| `type:feature` | New feature or capability |
| `type:improvement` | Enhancement to existing feature |
| `type:bug` | Something is broken |
| `type:chore` | Maintenance, refactoring, dependencies |
| `type:docs` | Documentation |

### Priority Labels
| Label | Meaning |
|-------|---------|
| `priority:critical` | Drop everything, fix now |
| `priority:high` | Next sprint priority |
| `priority:medium` | Planned work |
| `priority:low` | Nice to have |

### Status Labels
| Label | Meaning |
|-------|---------|
| `status:ready` | Fully defined, ready for development |
| `status:in-progress` | Actively being worked on |
| `status:blocked` | Waiting on dependency or decision |
| `status:review` | In PR review |
| `status:done` | Merged and verified |

### Bug Severity Labels
| Label | Meaning |
|-------|---------|
| `bug:critical` | System down or data loss |
| `bug:major` | Core feature broken for many users |
| `bug:minor` | Edge case or minor inconvenience |

## Milestones

Group related issues under a milestone to track progress toward a release or objective:

```bash
# List milestones
gh api repos/:owner/:repo/milestones

# Create a milestone
gh api repos/:owner/:repo/milestones -f title="v1.0 Launch" -f due_on="2026-03-01T00:00:00Z"

# Assign issue to milestone (via API)
gh api repos/:owner/:repo/issues/42 -X PATCH -f milestone=1
```

## Best Practices

- **One concern per issue**: Do not bundle multiple unrelated problems into a single issue. Split them.
- **Write for your future self**: Assume the person reading the issue has no context. Include links, screenshots, and reproduction steps.
- **Update issues as work progresses**: Leave comments when status changes, blockers arise, or decisions are made.
- **Close issues with context**: When closing, summarize what was done and link to the PR.
- **Never leave issues in limbo**: An issue should always have a clear status label and a clear owner.
