---
id: 24
title: Make command output concise and action-oriented
status: todo
priority: p1
worker: codex
model: gpt-5.5
effort: high
max_iterations: 5
parent: 21
depends_on: [23]
created: 2026-07-08T21:20:29Z
updated: 2026-07-08T21:20:29Z
---

# Make command output concise and action-oriented

## Objective
Quest's human-facing command output becomes easier to scan and always points to the next useful operator action.

## Done when
- [ ] bare `quest` output acts as a compact dashboard with counts, in-flight or blocked quests, ready work, active runs, and one exact next command
- [ ] general help is grouped by workflow while preserving every command and per-command help
- [ ] create, no-store, and init next-step output is concise and uses the actual quest id or state where available
- [ ] README quickstart matches the final command flow
- [ ] `npm test`, `npm run check:hygiene`, and `npm run check:manifests` pass

## Validation loop
```bash
npm test
npm run check:hygiene
npm run check:manifests
```

## Constraints
- keep output deterministic for snapshot tests
- do not remove machine-readable JSON fields

## Milestones
- [ ] M1 — update help rendering and snapshots
- [ ] M2 — align README quickstart with the concise flow

## Context
Loop findings: CLI/help loops 1, 2, 3, and 4. Files and symbols: renderStatusOverview, renderGeneralHelp, renderNoStore, renderInitNextSteps in lib/help.mjs; create handler in lib/cli.mjs; tests/snapshots; README.md.

## Out of scope
- adding interactive prompts or terminal UI dependencies

## Checkpoints
