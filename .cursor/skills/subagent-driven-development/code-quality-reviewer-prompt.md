# Code Quality Review Step

Use the code-reviewer template for a quality pass after spec compliance passes.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**Only run after spec compliance review passes.**

Use the template at `requesting-code-review/code-reviewer.md` with:

- **WHAT_WAS_IMPLEMENTED:** What you just built (from your report)
- **PLAN_OR_REQUIREMENTS:** Task N from [plan file]
- **DESCRIPTION:** Brief task summary
- **FILES_OR_DIFF:** Run `git diff` and paste the output (or list changed files and paste the diff) so the review is against the actual changes. Do not run git commit or git push — diff is for review only.

You can perform the review yourself using the checklist in the template, or ask the user to review. Output: Strengths, Issues (Critical/Important/Minor), Assessment.
