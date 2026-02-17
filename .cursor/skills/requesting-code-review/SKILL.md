---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Use the code-reviewer template to request review (from the user or as a focused review task in Cursor) so issues are caught before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing a major feature
- Before merging to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Gather context for the reviewer:**
- What was implemented (summary)
- Plan or requirements it should satisfy
- **Diff for review:** Run `git diff` (for uncommitted changes) or `git diff <base>..<head>` (for a commit range) and include the output so the reviewer sees exact changes. Use git only for reading diffs — do not run `git commit` or `git push`.

**2. Use the code-reviewer template:**

Fill the template at `requesting-code-review/code-reviewer.md` with:
- `{WHAT_WAS_IMPLEMENTED}` — What you just built
- `{PLAN_OR_REQUIREMENTS}` — What it should do
- `{DESCRIPTION}` — Brief summary
- **Changes to review:** Paste the `git diff` output (or list changed files and paste the diff). Do not commit or push.

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

[Use code-reviewer template with:]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  CHANGES: List files or paste diff for reviewer

[Reviewer (user or review pass) returns:]
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: `requesting-code-review/code-reviewer.md`
