---
id: product
name: Product
channels:
  - "#product"
members:
  - cpo
  - product-director
  - pm
  - ux
  - docs
---

# Product Team

## Overview

The Product team is responsible for defining what gets built and ensuring it meets user needs. The team owns the product roadmap, user research, UX design, and documentation. It coordinates with the Engineering team to ensure features are well-specified before development begins.

## Team Structure

| Role | ID | Responsibilities |
|------|----|-----------------|
| CPO | cpo | Product vision, roadmap, executive alignment |
| Product Director | product-director | Delivery management, cross-functional coordination |
| Product Manager | pm | User stories, acceptance criteria, backlog management |
| UX Designer | ux | Usability, design, user research |
| Documentation Writer | docs | User docs, developer docs, internal knowledge base |

## Channel: #product

The `#product` channel is the primary communication channel for the product team. Use it for:

- Sharing product priorities and roadmap updates.
- Coordinating on feature specifications and design reviews.
- Communicating decisions that affect the product direction.
- Flagging when specs are ready for engineering to pick up.

Product decisions and specifications should be documented in GitHub Issues, not only in the channel. The channel is for coordination; GitHub Issues are the source of truth.

## Product Workflow

### From Strategy to Specification

1. **CPO sets direction**: Strategic priorities come from the CPO as GitHub Issues or Milestone descriptions.
2. **Product Director coordinates delivery**: The Product Director ensures priorities move from strategy to well-defined specifications.
3. **PM writes user stories**: PMs translate priorities into user stories with acceptance criteria in GitHub Issues.
4. **UX designs solutions**: UX produces wireframes and designs, reviewed by the PM and CPO before handoff to engineering.
5. **Docs plans documentation**: The Docs writer is looped in early to plan documentation alongside feature development.
6. **Handoff to Engineering**: When a feature is fully specified (user story + design + acceptance criteria + docs plan), the Product Director or PM flags it as `status:ready` and coordinates handoff with the Engineering Director.

### Feature Definition Checklist

Before a feature is handed off to engineering, verify:
- [ ] User story is written with a clear user problem and goal
- [ ] Acceptance criteria are specific, testable, and complete
- [ ] UX design is approved by PM and CPO
- [ ] Edge cases and error states are documented
- [ ] Documentation requirements are noted
- [ ] Dependencies on other features or infrastructure are identified
- [ ] Success metrics are defined

## Roadmap Management

The product roadmap is maintained as GitHub Milestones. Each milestone represents a meaningful deliverable (a release, a feature set, or a period of work).

View the current roadmap:
```bash
gh milestone list
```

Issues on the roadmap are organized by:
- **Now**: In the current sprint or imminent.
- **Next**: Prioritized and defined, coming in the next sprint.
- **Later**: Planned but not yet fully defined.

## Cross-Functional Coordination

The Product Director attends engineering planning sessions to ensure alignment on:
- Which features are ready for development.
- Engineering capacity and timeline estimates.
- Dependencies and sequencing.
- Open design questions that need resolution before engineering can start.

The CPO maintains a standing check-in with the CEO to ensure the product roadmap reflects current business priorities.
