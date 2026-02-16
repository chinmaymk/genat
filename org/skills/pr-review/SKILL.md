---
name: pr-review
description: Review pull requests using the GitHub CLI (gh). Use to approve PRs, request changes, add review comments, run gh pr checks, and merge when ready. Supports thorough code review for correctness, tests, quality, and security.
compatibility: Requires gh CLI on PATH and gh auth login.
metadata:
  displayName: Review Pull Requests
  tool: gh
  requires:
    cli: gh
---

# Review Pull Requests

## Overview

Use the GitHub CLI (`gh`) to review pull requests. Thorough, timely code review is one of the highest-leverage activities in an engineering organization. Good reviews catch bugs, improve code quality, spread knowledge across the team, and build a culture of craftsmanship.

## Prerequisites

- `gh` CLI must be installed and available on `PATH`.
- You must be authenticated: run `gh auth status` to verify.

## Finding PRs to Review

List all open PRs in the repository:
```bash
gh pr list
```

List PRs that are awaiting your review:
```bash
gh pr list --search "review-requested:@me"
```

View a specific PR:
```bash
gh pr view 123
```

View the diff for a PR:
```bash
gh pr diff 123
```

Check the CI status of a PR:
```bash
gh pr checks 123
```

## Reviewing a PR

### Approve a PR

After reviewing and determining the changes are ready to merge:
```bash
gh pr review 123 --approve --body "Looks good. Clean implementation, tests cover the key cases."
```

### Request Changes

When there are issues that must be addressed before the PR can be merged:
```bash
gh pr review 123 --request-changes --body "$(cat <<'EOF'
A few things to address before this is ready:

1. **Missing error handling in `src/auth.ts` line 42**: If `findUser` returns null, the code will throw an unhandled exception. Please add a null check and return a 404 or 401 as appropriate.

2. **Test coverage gap**: The tests do not cover the case where the email is valid but the password is wrong. Please add a test for that path.

3. **Minor**: Variable name `d` on line 78 is unclear. Consider renaming to `deadline` or `dueDate`.

Items 1 and 2 are blocking. Item 3 is a suggestion.
EOF
)"
```

### Comment Without Approving or Rejecting

To add a comment without submitting a formal approval or change request:
```bash
gh pr review 123 --comment --body "Left some thoughts inline - none blocking, just suggestions for clarity."
```

## Review Guidelines

### What to Look For

**Correctness**
- Does the code do what the PR description says it does?
- Are edge cases and error states handled correctly?
- Are there off-by-one errors, null dereferences, or race conditions?

**Test Coverage**
- Are the new behaviors covered by tests?
- Do the tests actually assert meaningful behavior (not just that functions run without throwing)?
- Are error cases and edge cases tested?

**Code Quality**
- Is the code readable? Could a teammate understand it without the author explaining it?
- Is there unnecessary complexity? Is there a simpler way to achieve the same outcome?
- Is there code duplication that should be extracted into a shared utility?

**Convention Adherence**
- Does the code follow the project's TypeScript and naming conventions?
- Are file and folder structures consistent with the rest of the codebase?
- Are commit messages following the conventional commits format?

**Security**
- Is user input validated and sanitized before use?
- Are secrets and credentials handled safely (never hardcoded, logged, or exposed in responses)?
- Are authentication and authorization checks applied where needed?

**Performance**
- Are there obvious performance issues (N+1 queries, unbounded loops, unnecessary re-computation)?
- Are expensive operations properly cached or deferred?

### Review Tone and Etiquette

- **Distinguish blocking from non-blocking**: Clearly label which comments must be addressed before merge and which are optional suggestions.
- **Explain the why**: "This will cause X bug in Y scenario" is more useful than "this is wrong."
- **Be specific**: Point to the exact line. Propose a fix when you can.
- **Assume good intent**: The author made decisions for reasons. If something is unclear, ask before criticizing.
- **Approve promptly**: Do not let PRs sit in review for more than one working session. Stale PRs are a team velocity problem.

## After Reviewing

Once a PR is approved and all conversations are resolved:
```bash
# Merge when ready (if you have merge permissions)
gh pr merge 123 --squash --delete-branch
```

Standard merge strategies:
- `--squash`: Squash all commits into one (preferred for feature branches).
- `--merge`: Preserve all commits (use for long-running branches with meaningful history).
- `--rebase`: Rebase commits onto main (use when linear history is required).
