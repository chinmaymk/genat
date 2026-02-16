---
id: engineering
name: Engineering
channels:
  - "#engineering"
work_queue: engineering
members:
  - eng-director
  - swe
  - sdet
  - sre
---

# Engineering Team

## Overview

The Engineering team is responsible for designing, building, testing, and operating the product. The team works from a shared work queue managed as GitHub Issues and coordinates through the `#engineering` channel.

## Team Structure

| Role | ID | Responsibilities |
|------|----|-----------------|
| Engineering Director | eng-director | Leads the team, decomposes priorities, reviews PRs, unblocks engineers |
| Software Engineer | swe | Implements features and fixes from the work queue |
| SDET | sdet | Quality gate, test automation, bug filing |
| SRE | sre | Deployments, infrastructure, monitoring |

## Work Queue

The engineering work queue is managed as GitHub Issues in this repository.

### Work Queue Lifecycle

1. **Backlog**: Issues exist but are not yet fully defined. Label: (none or `status:backlog`)
2. **Ready**: Issues are fully defined with acceptance criteria and are ready to be picked up. Label: `status:ready`
3. **In Progress**: An engineer has picked up the task and is actively working on it. Label: `status:in-progress`
4. **Review**: Implementation is complete; a PR is open and awaiting review. Label: `status:review`
5. **Blocked**: Progress is blocked on a dependency, decision, or external factor. Label: `status:blocked`
6. **Done**: The PR is merged and the issue is closed. Label: (closed)

### Picking Up Work

Engineers should pick up work from the `status:ready` queue:
```bash
gh issue list --label "status:ready" --label "team:engineering"
```

When picking up a task:
1. Assign yourself: `gh issue edit <number> --assignee "@me"`
2. Update the label: `gh issue edit <number> --add-label "status:in-progress" --remove-label "status:ready"`
3. Leave a comment: `gh issue comment <number> --body "Picking this up now."`

## Channel: #engineering

The `#engineering` channel is the primary communication channel for the engineering team. Use it for:

- Announcing when you pick up or complete a task.
- Asking for unblocking help.
- Flagging PRs that are ready for review.
- Sharing team-relevant news, incidents, or decisions.

Keep discussions in GitHub Issues when they relate to specific tasks. The channel is for coordination, not the source of truth for decisions.

## Engineering Rituals

### PR Review SLA
- All PRs should receive a first review within one working session of being opened.
- The Engineering Director is the default reviewer. Any senior engineer may also review.

### Deployment Cadence
- The SRE deploys to production whenever there are merged PRs that have not been deployed.
- Deployments should happen at least daily during active development.

### Incident Response
- SRE is the first responder for production incidents.
- All incidents are tracked as GitHub Issues with the `type:incident` label.
- Post-mortems are required for any incident that caused user-visible impact.

## Standards

All engineering work follows the conventions in `org/knowledge/conventions.md` and the architecture decisions in `org/knowledge/architecture.md`.
