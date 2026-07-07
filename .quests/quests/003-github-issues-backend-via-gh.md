---
id: 3
title: GitHub Issues backend via gh
status: todo
priority: p1
worker: claude
model: inherit
max_iterations: 8
depends_on: [2]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
---

# GitHub Issues backend via gh

## Objective
Implement the GitHub backend (`lib/store-github.mjs`) so every quest command
works identically against GitHub Issues through the `gh` CLI, per the mapping
table in contract-spec.

## Done when
- [ ] Full mapping implemented: body sections, `<!-- quest:meta -->` block,
      status/priority labels (auto-created by `init`), checkpoint comments,
      epic `## Children` task lists, issue-state mirroring.
- [ ] Lifecycle round-trip test green against a fake `gh` PATH shim.
- [ ] Live smoke against a scratch repo: `quest show <id> --json` returns the
      SAME shape as the local backend for an equivalent record.
- [ ] Fail-honest: missing/unauthenticated `gh` and any `gh` failure exit 6
      surfacing gh's stderr; no silent fallback to local (asserted in tests).

## Validation loop
```bash
node --test tests/store-github.test.mjs
node --test tests/
```

## Constraints
- Pure `gh` invocations — no direct GitHub API client, no tokens handled here.
- Config, amendments, and the runs journal stay local in `.quests/`.
- Checkpoint bytes identical across backends.

## Context
Mapping table: `skills/protocol/references/contract-spec.md` ("GitHub backend
mapping"). Store seam: `lib/store-local.mjs` from quest 2 defines the interface.

## Out of scope
- GitHub sub-issues GraphQL API; GitHub milestones.

## Checkpoints
