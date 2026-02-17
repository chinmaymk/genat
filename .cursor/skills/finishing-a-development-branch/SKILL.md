---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

Ask the user: "This branch split from main — is that correct?" or infer from context.

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 4: Execute Choice

**Option 1 — Merge locally:** Tell the user to switch to the base branch, pull latest, merge the feature branch, run tests, then delete the feature branch if desired.

**Option 2 — Push and create PR:** Tell the user to push the branch and create a PR (e.g. via GitHub UI or `gh pr create`). Offer to draft the PR title and body (summary bullets, test plan).

**Option 3 — Keep as-is:** Report that the branch is preserved. No cleanup.

**Option 4 — Discard:** Confirm first: "This will permanently delete branch &lt;name&gt; and its changes. Type 'discard' to confirm." Wait for exact confirmation. If confirmed, tell the user to switch to base branch and delete the feature branch (e.g. `git checkout &lt;base&gt;`, `git branch -D &lt;feature-branch&gt;`). Do not run destructive git commands yourself; the user runs them.

**Worktree cleanup (if user used a worktree):** For Options 1 and 4, remind the user they can remove the worktree if they created one (e.g. `git worktree remove &lt;path&gt;`). For Option 3, leave the worktree as-is.

## Quick Reference

| Option | You do | User does |
|--------|--------|-----------|
| 1. Merge locally | Describe steps | Checkout base, pull, merge, test, optionally delete branch |
| 2. Create PR | Draft title/body if needed | Push branch, create PR |
| 3. Keep as-is | Confirm | Nothing |
| 4. Discard | Confirm after "discard" | Checkout base, delete branch |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 4 structured options

**Removing worktree when user might need it**
- **Problem:** Suggest removing worktree when user might need it (Option 2, 3)
- **Fix:** Only suggest worktree cleanup for Options 1 and 4

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Run destructive git commands without user confirmation

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only

## Integration

**Called by:**
- **subagent-driven-development** (final step) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**
- **using-git-worktrees** - If user created a worktree, remind them about cleanup for Options 1 & 4
