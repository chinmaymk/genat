# Spec Compliance Review Checklist

Use this when checking your own implementation against the spec (after each task).

**Purpose:** Verify you built what was requested (nothing more, nothing less).

## What Was Requested

[FULL TEXT of task requirements]

## What You Reported You Built

[Your own report — but don't trust it alone]

## CRITICAL: Verify Against Code

Your report may be incomplete or optimistic. You MUST verify by reading the actual code.

**DO NOT:**
- Trust your summary without re-reading the code
- Assume completeness from memory

**DO:**
- Read the actual code you wrote
- Compare implementation to requirements line by line
- Check for missing pieces you claimed to implement
- Look for extra features not in spec

## Your Check

**Missing requirements:**
- Did you implement everything that was requested?
- Any requirements skipped or missed?
- Did you claim something works but not actually implement it?

**Extra/unneeded work:**
- Did you build things that weren't requested?
- Over-engineer or add unnecessary features?
- Add "nice to haves" that weren't in spec?

**Misunderstandings:**
- Did you interpret requirements differently than intended?
- Solve the wrong problem or implement the right feature the wrong way?

**Verify by reading code, not by trusting your report.**

**Result:**
- ✅ Spec compliant (everything matches after code inspection)
- ❌ Issues found: [list specifically what's missing or extra, with file:line references]
