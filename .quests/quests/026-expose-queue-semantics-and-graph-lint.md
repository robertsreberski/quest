---
id: 26
title: Expose queue semantics and graph lint
status: todo
priority: p1
worker: codex
model: gpt-5.5
effort: high
max_iterations: 5
parent: 21
depends_on: [22, 25]
created: 2026-07-08T21:20:42Z
updated: 2026-07-08T21:20:42Z
---

# Expose queue semantics and graph lint

## Objective
Quest distinguishes worker-dispatchable work from inline epic closure and catches corrupted quest graph references during lint.

## Done when
- [ ] local and GitHub backends share the same queue/readiness computation for worker-ready quests, inline-close-ready epics, and blocked reasons
- [ ] a command or JSON option exposes inline-close-ready epics without making them look worker-dispatchable
- [ ] `quest lint --all` reports missing parent and dependency references in hand-corrupted stores
- [ ] runner ready-wave behavior remains compatible and never auto-dispatches epics
- [ ] `npm test` passes

## Validation loop
```bash
npm test
```

## Constraints
- preserve existing `quest list --ready` behavior unless tests and docs intentionally update it
- GitHub backend failures must still surface gh stderr and never fall back to local

## Milestones
- [ ] M1 — extract shared queue/graph logic with local and GitHub tests
- [ ] M2 — add lint graph checks and operator-visible queue output

## Context
Loop findings: contract/store loops 3, 4, and 5; runner loop 2. Files and symbols: readyQuests and lintAll in lib/store-local.mjs and lib/store-github.mjs; runReady in lib/runner.mjs; tests/store-local.test.mjs; tests/store-github.test.mjs; tests/runner.test.mjs.

## Out of scope
- requiring structured final done-evidence in checkpoint format

## Checkpoints
